#!/usr/bin/env node
import { ApiError } from "./client.js";
import {
  AuthRequiredError,
  clientFor,
  EXIT,
  exitCodeFor,
  parseArgs,
  UsageError,
  type Command,
} from "./command.js";
import { activityList, status, transfersList } from "./commands/activity.js";
import { authLogin, authLogout, authProfiles, authStatus } from "./commands/auth.js";
import { backupsCreate, backupsList, backupsRestore, backupsShow } from "./commands/backups.js";
import { filesCat, filesGet, filesList, filesMkdir, filesMv, filesPut, filesRm } from "./commands/files.js";
import { serversList, serversShow, serversTest } from "./commands/servers.js";
import { fail, info, print, style } from "./output.js";

const VERSION = "1.0.0";

/**
 * Commands are keyed by the words the user types, longest match first, so
 * `files ls` and a future `files` both resolve without special cases.
 */
const COMMANDS: Command[] = [
  authLogin, authStatus, authLogout, authProfiles,
  serversList, serversShow, serversTest,
  filesList, filesCat, filesGet, filesPut, filesRm, filesMkdir, filesMv,
  backupsList, backupsShow, backupsCreate, backupsRestore,
  transfersList, activityList, status,
];

/** Aliases for the shapes people's fingers already know. */
const ALIASES: Record<string, string> = {
  "auth whoami": "auth status",
  "servers list": "servers ls",
  "files list": "files ls",
  "backups list": "backups ls",
  "transfers list": "transfers ls",
  "activity list": "activity ls",
  "logs": "activity ls",
};

function resolve(argv: string[]): { command: Command; rest: string[] } | undefined {
  // Two words then one, so `files ls` is preferred over a bare `files`.
  for (const width of [2, 1]) {
    if (argv.length < width) continue;
    const typed = argv.slice(0, width).join(" ");
    const name = ALIASES[typed] ?? typed;
    const command = COMMANDS.find((candidate) => candidate.name === name);
    if (command) return { command, rest: argv.slice(width) };
  }
  return undefined;
}

function help(): void {
  print(`${style.bold("orbit")} — Orbit+ server operations

${style.dim("USAGE")}
  orbit <command> [arguments] [flags]

${style.dim("COMMANDS")}`);

  // Grouped by first word, which is how the commands are organised anyway.
  const groups = new Map<string, Command[]>();
  for (const command of COMMANDS) {
    const group = command.name.includes(" ") ? command.name.split(" ")[0]! : "general";
    groups.set(group, [...(groups.get(group) ?? []), command]);
  }

  const width = Math.max(...COMMANDS.map((command) => command.name.length));
  for (const [group, commands] of groups) {
    print(`\n  ${style.bold(group)}`);
    for (const command of commands) {
      print(`    ${command.name.padEnd(width)}  ${style.dim(command.summary)}`);
    }
  }

  print(`
${style.dim("GLOBAL FLAGS")}
  --json              Machine-readable output on stdout
  --yes, -y           Skip confirmation prompts
  --profile <name>    Use a named credential profile
  --help              Show usage for a command
  --version           Print the version

${style.dim("ENVIRONMENT")}
  ORBIT_API_KEY       Credentials for non-interactive use; overrides stored profiles
  ORBIT_API_URL       API base URL, including /api/v1
  ORBIT_PROFILE       Default profile name
  NO_COLOR            Disable colour

${style.dim("EXIT CODES")}
  0 success   2 usage   3 auth   4 not found   5 denied   6 conflict   7 server   8 network`);
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    help();
    return argv.length === 0 ? EXIT.usage : EXIT.ok;
  }
  if (argv[0] === "--version" || argv[0] === "-v" || argv[0] === "version") {
    print(VERSION);
    return EXIT.ok;
  }

  const resolved = resolve(argv);
  if (!resolved) {
    fail(`Unknown command: ${argv.slice(0, 2).join(" ")}`);
    info("Run `orbit help` to see what is available.");
    return EXIT.usage;
  }

  const { command, rest } = resolved;
  const flags = parseArgs(rest);

  if (flags.values.help === "true") {
    print(`${command.summary}\n\n${style.dim("USAGE")}\n  ${command.usage}`);
    return EXIT.ok;
  }

  // Commands that only touch local state are given a client they never use, so
  // `orbit auth login` works before any credentials exist.
  const client = command.offline ? (undefined as never) : await clientFor(flags);
  const code = await command.run({ flags, client });
  return typeof code === "number" ? code : EXIT.ok;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((error: unknown) => {
    if (error instanceof UsageError) {
      fail(error.message);
      process.exitCode = EXIT.usage;
      return;
    }
    if (error instanceof AuthRequiredError) {
      fail(error.message);
      process.exitCode = EXIT.auth;
      return;
    }
    if (error instanceof ApiError) {
      fail(error.message);
      process.exitCode = exitCodeFor(error.status);
      return;
    }
    // Anything else is a bug or a local filesystem problem. The message is
    // shown; the stack only with ORBIT_DEBUG, so normal failures stay readable.
    fail(error instanceof Error ? error.message : String(error));
    if (process.env.ORBIT_DEBUG && error instanceof Error) info(style.dim(error.stack ?? ""));
    process.exitCode = 1;
  });
