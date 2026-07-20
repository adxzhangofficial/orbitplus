import { OrbitClient } from "./client.js";
import { UsageError } from "./command.js";
import type { Server } from "./commands/servers.js";

/**
 * Turns what someone typed into a server.
 *
 * The listing shows shortened ids because full UUIDs make a table unreadable,
 * so those short forms have to work when they are typed back — otherwise the
 * output is showing an identifier that is not an identifier. A name works too,
 * because that is what people actually remember.
 *
 * An ambiguous prefix is an error rather than a guess: picking one of two
 * servers on the user's behalf is how a command lands on production.
 */

let cache: Server[] | undefined;

async function servers(client: OrbitClient): Promise<Server[]> {
  cache ??= (await client.get<Server[]>("/servers", { limit: 200 })).data;
  return cache;
}

export async function resolveServer(client: OrbitClient, reference: string): Promise<Server> {
  // A full UUID is unambiguous, so it is used directly and costs no extra call.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference)) {
    return (await client.get<Server>(`/servers/${encodeURIComponent(reference)}`)).data;
  }

  const all = await servers(client);
  const lowered = reference.toLowerCase();

  const exactName = all.filter((server) => server.name.toLowerCase() === lowered);
  if (exactName.length === 1) return exactName[0]!;

  const matches = all.filter(
    (server) => server.id.startsWith(lowered) || server.name.toLowerCase().includes(lowered),
  );

  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0) {
    throw new UsageError(`No server matches "${reference}". Run \`orbit servers ls\` to see them.`);
  }
  throw new UsageError(
    `"${reference}" matches ${matches.length} servers: ${matches.map((server) => server.name).join(", ")}. Use a longer prefix or the full id.`,
  );
}

/**
 * The path a command should act on when none was given.
 *
 * Defaulting to "/" is wrong: a connection is scoped to its root path, and the
 * API rejects anything above it. The server's own root is both valid and what
 * the person meant.
 */
export function defaultPath(server: Server, given?: string): string {
  return given ?? server.rootPath ?? "/";
}
