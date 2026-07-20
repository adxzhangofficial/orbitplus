import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import path from "node:path";

/**
 * Where the CLI keeps its credentials.
 *
 * An API key is a bearer token: whoever holds the file can act as the
 * organization until the key is revoked. So it is written to the user's own
 * home directory with owner-only permissions, never to the working directory
 * where it could be committed by accident.
 *
 * The environment always wins over the file. CI has no interactive login and
 * should not be made to write a dotfile to run one command.
 */

export interface Profile {
  /** API base, including the version prefix. */
  apiUrl: string;
  apiKey: string;
  /** Recorded at login so `orbit auth status` can name the workspace offline. */
  organization?: string;
}

interface ConfigFile {
  version: 1;
  current: string;
  profiles: Record<string, Profile>;
}

/** The API's own default port. 5175 is the web app, which does not serve /api. */
export const DEFAULT_API_URL = "http://127.0.0.1:4400/api/v1";

export function configDirectory(): string {
  // XDG on Linux and macOS; %APPDATA% on Windows, where a dotfile in the user
  // profile root is out of place.
  if (process.env.ORBIT_CONFIG_DIR) return process.env.ORBIT_CONFIG_DIR;
  if (platform() === "win32") {
    return path.join(process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming"), "orbit");
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(homedir(), ".config"), "orbit");
}

function configPath(): string {
  return path.join(configDirectory(), "config.json");
}

async function readConfig(): Promise<ConfigFile> {
  try {
    const parsed = JSON.parse(await readFile(configPath(), "utf8")) as ConfigFile;
    if (parsed.version !== 1 || typeof parsed.profiles !== "object" || parsed.profiles === null) {
      throw new Error("unrecognised");
    }
    return parsed;
  } catch {
    // A missing or unreadable config is the same situation as a fresh install:
    // there is nothing to act on. Refusing to start would be worse than
    // prompting for a login.
    return { version: 1, current: "default", profiles: {} };
  }
}

async function writeConfig(config: ConfigFile): Promise<void> {
  const directory = configDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = configPath();
  // Written owner-only from the start rather than chmod-ed afterwards: between
  // creation and the chmod, a world-readable file would hold a live key.
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  // Windows ignores the mode on write, and a pre-existing file keeps its old
  // permissions on some platforms, so this is not redundant.
  await chmod(file, 0o600).catch(() => undefined);
}

/**
 * The credentials to use, environment first.
 *
 * Returns undefined rather than throwing so callers can give an instruction
 * ("run orbit auth login") instead of a stack trace.
 */
export async function currentProfile(profileName?: string): Promise<Profile | undefined> {
  const envKey = process.env.ORBIT_API_KEY;
  if (envKey) {
    return {
      apiKey: envKey,
      apiUrl: process.env.ORBIT_API_URL ?? DEFAULT_API_URL,
      organization: process.env.ORBIT_ORGANIZATION,
    };
  }
  const config = await readConfig();
  const name = profileName ?? process.env.ORBIT_PROFILE ?? config.current;
  return config.profiles[name];
}

export async function saveProfile(name: string, profile: Profile): Promise<void> {
  const config = await readConfig();
  config.profiles[name] = profile;
  config.current = name;
  await writeConfig(config);
}

export async function removeProfile(name: string): Promise<boolean> {
  const config = await readConfig();
  if (!config.profiles[name]) return false;
  delete config.profiles[name];
  if (config.current === name) config.current = Object.keys(config.profiles)[0] ?? "default";
  await writeConfig(config);
  return true;
}

export async function listProfiles(): Promise<{ current: string; names: string[] }> {
  const config = await readConfig();
  return { current: config.current, names: Object.keys(config.profiles) };
}

/** Removes the whole config, for `orbit auth logout --all`. */
export async function clearConfig(): Promise<void> {
  await rm(configPath(), { force: true });
}

/** Shows enough of a key to recognise it, never enough to use it. */
export function maskKey(key: string): string {
  if (key.length <= 12) return "…";
  return `${key.slice(0, 8)}…${key.slice(-4)}`;
}
