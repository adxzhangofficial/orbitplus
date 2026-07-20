import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { confirm, required, UsageError, type Command } from "../command.js";
import { bytes, info, json, print, relative, style, table } from "../output.js";
import { defaultPath, resolveServer } from "../resolve.js";

/**
 * Remote file operations.
 *
 * Every command takes the server id first, because without it a path is
 * ambiguous and running the wrong one against production is the mistake this
 * ordering exists to prevent.
 */

interface RemoteEntry {
  name: string;
  path: string;
  type: "file" | "directory" | "symlink" | "other";
  size: number;
  modifiedAt: string;
  mode?: string;
}

interface FileContent {
  path: string;
  content: string;
  encoding: "utf8" | "base64";
  size: number;
  checksum: string;
}

function base(serverId: string): string {
  return `/servers/${encodeURIComponent(serverId)}/files`;
}

export const filesList: Command = {
  name: "files ls",
  summary: "List a remote directory",
  usage: "orbit files ls <server-id> [path] [--fresh] [--long]",
  async run({ flags, client }) {
    const server = await resolveServer(client, required(flags, 0, "server-id"));
    const serverId = server.id;
    const remotePath = defaultPath(server, flags.positional[1]);

    const { data, meta } = await client.get<RemoteEntry[]>(base(serverId), {
      path: remotePath,
      // Listings are cached so browsing feels instant; --fresh forces the
      // round trip when the answer must be current.
      fresh: flags.values.fresh === "true" ? "true" : undefined,
    });

    if (flags.json) { json(data); return; }
    if (data.length === 0) { print(style.dim("(empty)")); return; }

    const sorted = [...data].sort((a, b) => {
      // Directories first, the convention every file browser uses.
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    if (flags.values.long === "true") {
      print(table(sorted, [
        { header: "TYPE", value: (row) => (row.type === "directory" ? style.cyan("dir") : row.type === "symlink" ? style.dim("link") : "file") },
        { header: "SIZE", value: (row) => (row.type === "directory" ? style.dim("—") : bytes(row.size)), align: "right" },
        { header: "MODIFIED", value: (row) => style.dim(relative(row.modifiedAt)) },
        { header: "NAME", value: (row) => (row.type === "directory" ? style.cyan(row.name) : row.name) },
      ]));
    } else {
      for (const entry of sorted) {
        print(entry.type === "directory" ? style.cyan(`${entry.name}/`) : entry.name);
      }
    }

    if (meta?.cache === "hit") info(style.dim("Served from cache; pass --fresh to re-read the server."));
  },
};

export const filesCat: Command = {
  name: "files cat",
  summary: "Print a remote file",
  usage: "orbit files cat <server-id> <path>",
  async run({ flags, client }) {
    const serverId = (await resolveServer(client, required(flags, 0, "server-id"))).id;
    const remotePath = required(flags, 1, "path");
    const { data } = await client.get<FileContent>(`${base(serverId)}/content`, { path: remotePath });

    if (flags.json) { json(data); return; }
    if (data.encoding === "base64") {
      // Writing raw bytes to a terminal can leave it in a broken state, and
      // the useful action is almost always `files get`.
      info(style.yellow(`${data.path} is binary (${bytes(data.size)}). Use \`orbit files get\` to download it.`));
      return 1;
    }
    process.stdout.write(data.content);
    if (!data.content.endsWith("\n")) process.stdout.write("\n");
  },
};

export const filesGet: Command = {
  name: "files get",
  summary: "Download a remote file",
  usage: "orbit files get <server-id> <remote-path> [local-path]",
  async run({ flags, client }) {
    const serverId = (await resolveServer(client, required(flags, 0, "server-id"))).id;
    const remotePath = required(flags, 1, "remote-path");
    const { data } = await client.get<FileContent>(`${base(serverId)}/content`, { path: remotePath });

    const content = Buffer.from(data.content, data.encoding);

    // Verified before anything is written. A truncated or altered transfer
    // that lands on disk looking complete is worse than a failed one.
    const actual = createHash("sha256").update(content).digest("hex");
    if (actual !== data.checksum) {
      throw new Error(`Checksum mismatch for ${remotePath} — the download was not written`);
    }

    const target = flags.positional[2] ?? path.basename(remotePath);
    if (target === "-") { process.stdout.write(content); return; }

    try {
      // wx fails rather than truncating: the local file may be the only copy,
      // so overwriting it is a decision for the person running the command.
      await writeFile(target, content, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // confirm() has already explained why it is refusing, so this returns
      // rather than raising a second message saying the same thing.
      if (!(await confirm(flags, `${target} already exists. Overwrite?`))) return 1;
      await writeFile(target, content);
    }

    if (flags.json) { json({ path: remotePath, localPath: target, size: content.length, checksum: actual }); return; }
    print(`${style.green("✓")} ${remotePath} → ${target} (${bytes(content.length)})`);
  },
};

export const filesPut: Command = {
  name: "files put",
  summary: "Upload a local file",
  usage: "orbit files put <server-id> <local-path> <remote-path> [--note <text>]",
  async run({ flags, client }) {
    const serverId = (await resolveServer(client, required(flags, 0, "server-id"))).id;
    const localPath = required(flags, 1, "local-path");
    const remotePath = required(flags, 2, "remote-path");

    const content = await readFile(localPath);
    // Binary survives base64; text stays readable in the version history.
    const binary = content.includes(0);

    const { data } = await client.request<{ path: string; checksum: string; versionId?: string }>(
      `${base(serverId)}/content`,
      {
        method: "PUT",
        body: {
          path: remotePath,
          content: content.toString(binary ? "base64" : "utf8"),
          encoding: binary ? "base64" : "utf8",
          note: flags.values.note,
        },
        timeoutMs: 120_000,
      },
    );

    if (flags.json) { json(data); return; }
    print(`${style.green("✓")} ${localPath} → ${data.path} (${bytes(content.length)})`);
    if (data.versionId) info(style.dim(`Previous contents kept as version ${data.versionId}.`));
  },
};

export const filesRm: Command = {
  name: "files rm",
  summary: "Delete a remote file or directory",
  usage: "orbit files rm <server-id> <path> [--recursive] [--yes]",
  async run({ flags, client }) {
    const serverId = (await resolveServer(client, required(flags, 0, "server-id"))).id;
    const remotePath = required(flags, 1, "path");
    const recursive = flags.values.recursive === "true" || flags.values.r === "true";

    if (remotePath === "/" && recursive) {
      // No confirmation prompt makes this reasonable.
      throw new UsageError("Refusing to recursively delete the root of a server");
    }

    const question = recursive
      ? `Recursively delete ${remotePath} and everything under it?`
      : `Delete ${remotePath}?`;
    if (!(await confirm(flags, question))) { info("Cancelled."); return 1; }

    await client.request(`${base(serverId)}/entry`, {
      method: "DELETE",
      query: { path: remotePath, recursive: String(recursive) },
      timeoutMs: 120_000,
    });

    if (flags.json) { json({ deleted: remotePath, recursive }); return; }
    print(`${style.green("✓")} Deleted ${remotePath}`);
    info(style.dim("A snapshot was kept in file history where the file was readable."));
  },
};

export const filesMkdir: Command = {
  name: "files mkdir",
  summary: "Create a remote directory",
  usage: "orbit files mkdir <server-id> <path>",
  async run({ flags, client }) {
    const serverId = (await resolveServer(client, required(flags, 0, "server-id"))).id;
    const remotePath = required(flags, 1, "path");
    const { data } = await client.post<{ path: string }>(`${base(serverId)}/directory`, { path: remotePath });
    if (flags.json) { json(data); return; }
    print(`${style.green("✓")} Created ${data.path}`);
  },
};

export const filesMv: Command = {
  name: "files mv",
  summary: "Rename or move a remote path",
  usage: "orbit files mv <server-id> <from> <to>",
  async run({ flags, client }) {
    const serverId = (await resolveServer(client, required(flags, 0, "server-id"))).id;
    const from = required(flags, 1, "from");
    const to = required(flags, 2, "to");
    const { data } = await client.post<{ from: string; to: string }>(`${base(serverId)}/rename`, { from, to });
    if (flags.json) { json(data); return; }
    print(`${style.green("✓")} ${from} → ${to}`);
  },
};
