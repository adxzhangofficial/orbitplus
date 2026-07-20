import { currentProfile } from "./config.js";
import { OrbitClient } from "./client.js";
import { fail } from "./output.js";

/**
 * Command plumbing.
 *
 * Exit codes are part of the interface: a script running `orbit backups create`
 * in CI needs to distinguish "your key is wrong" from "the server refused" from
 * "the network is down", and a single code of 1 for everything makes that
 * impossible.
 */

export const EXIT = {
  ok: 0,
  usage: 2,
  auth: 3,
  notFound: 4,
  denied: 5,
  conflict: 6,
  server: 7,
  network: 8,
} as const;

export class UsageError extends Error {}

export interface Flags {
  json: boolean;
  yes: boolean;
  profile?: string;
  values: Record<string, string>;
  positional: string[];
}

export interface CommandContext {
  flags: Flags;
  client: OrbitClient;
}

export interface Command {
  name: string;
  summary: string;
  usage: string;
  /** Commands that only touch local files skip the credential check. */
  offline?: boolean;
  run: (context: CommandContext) => Promise<number | void>;
}

/**
 * Parses argv.
 *
 * Deliberately small: no library, so installing the CLI pulls in nothing and
 * there is no dependency between a user and a shell command that can act on
 * their servers.
 *
 * `--` stops parsing, so a path that begins with a dash can still be passed.
 */
export function parseArgs(argv: string[]): Flags {
  const flags: Flags = { json: false, yes: false, values: {}, positional: [] };
  let literal = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (literal) { flags.positional.push(argument); continue; }
    if (argument === "--") { literal = true; continue; }

    if (argument === "--json") { flags.json = true; continue; }
    if (argument === "--yes" || argument === "-y") { flags.yes = true; continue; }

    if (argument.startsWith("--")) {
      const equals = argument.indexOf("=");
      if (equals !== -1) {
        flags.values[argument.slice(2, equals)] = argument.slice(equals + 1);
        continue;
      }
      const name = argument.slice(2);
      const next = argv[index + 1];
      // A bare trailing flag is a boolean; one followed by a value takes it.
      if (next === undefined || next.startsWith("-")) {
        flags.values[name] = "true";
      } else {
        flags.values[name] = next;
        index += 1;
      }
      continue;
    }

    flags.positional.push(argument);
  }

  if (flags.values.profile) flags.profile = flags.values.profile;
  return flags;
}

/** A required positional, with the argument's name in the error. */
export function required(flags: Flags, index: number, name: string): string {
  const value = flags.positional[index];
  if (!value) throw new UsageError(`Missing <${name}>`);
  return value;
}

export async function clientFor(flags: Flags): Promise<OrbitClient> {
  const profile = await currentProfile(flags.profile);
  if (!profile) {
    throw new AuthRequiredError(
      "No credentials found. Run `orbit auth login`, or set ORBIT_API_KEY for non-interactive use.",
    );
  }
  return new OrbitClient(profile);
}

export class AuthRequiredError extends Error {}

/** Maps an HTTP status onto the exit code a script can branch on. */
export function exitCodeFor(status: number): number {
  if (status === 0) return EXIT.network;
  if (status === 401) return EXIT.auth;
  if (status === 403) return EXIT.denied;
  if (status === 404) return EXIT.notFound;
  if (status === 409) return EXIT.conflict;
  if (status >= 500) return EXIT.server;
  return 1;
}

/**
 * Asks before doing something that cannot be undone.
 *
 * Without a TTY there is nobody to ask, so the answer is no unless --yes was
 * passed. Assuming consent in a pipeline is how a script deletes a directory
 * nobody meant to delete.
 */
export async function confirm(flags: Flags, question: string): Promise<boolean> {
  if (flags.yes) return true;
  if (!process.stdin.isTTY) {
    fail(`${question} — refusing without a terminal. Pass --yes to confirm.`);
    return false;
  }
  process.stderr.write(`${question} [y/N] `);
  const answer = await readLine();
  return /^y(es)?$/i.test(answer.trim());
}

export function readLine(): Promise<string> {
  return new Promise((resolve) => {
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;
      process.stdin.off("data", onData);
      process.stdin.pause();
      resolve(buffer.slice(0, newline).replace(/\r$/, ""));
    };
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

/**
 * Reads a secret without echoing it.
 *
 * A pasted API key that stays on screen ends up in scrollback, in a screen
 * share, and in whatever records the terminal. Raw mode is what suppresses the
 * echo; if it is unavailable the prompt says so rather than quietly showing the
 * key.
 */
export async function readSecret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) return readLine();
  process.stderr.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise((resolve) => {
    let value = "";
    const onData = (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      for (const character of text) {
        if (character === "\r" || character === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (character === "") {
          // Ctrl-C during a password prompt must still exit.
          process.stdin.setRawMode(false);
          process.stderr.write("\n");
          process.exit(130);
        }
        if (character === "" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    process.stdin.on("data", onData);
  });
}
