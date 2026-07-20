import { OrbitClient } from "../client.js";
import { readSecret, UsageError, type Command } from "../command.js";
import { clearConfig, currentProfile, DEFAULT_API_URL, listProfiles, maskKey, removeProfile, saveProfile } from "../config.js";
import { configDirectory } from "../config.js";
import { detail, fail, info, json, print, style } from "../output.js";

interface Organization {
  id: string;
  name: string;
  plan: string;
}

export const authLogin: Command = {
  name: "auth login",
  summary: "Store an API key for this machine",
  usage: "orbit auth login [--url <api-url>] [--profile <name>] [--key <key>]",
  offline: true,
  async run({ flags }) {
    const apiUrl = flags.values.url ?? process.env.ORBIT_API_URL ?? DEFAULT_API_URL;
    const profileName = flags.profile ?? "default";

    // --key exists for provisioning scripts. It is second best: the value lands
    // in shell history and in the process list, where the prompt puts it in
    // neither.
    let apiKey = flags.values.key;
    if (!apiKey) {
      info(`Create a key in the workspace under Settings → API keys.`);
      apiKey = await readSecret("API key: ");
    }
    apiKey = apiKey.trim();

    if (!apiKey) throw new UsageError("No API key was entered");
    if (!apiKey.startsWith("orb_")) {
      throw new UsageError("That does not look like an Orbit API key — they begin with orb_");
    }

    // Verified before it is written. Storing a key that does not work only
    // moves the failure to the next command, where the cause is less obvious.
    const client = new OrbitClient({ apiUrl, apiKey });
    const { data: organization } = await client.get<Organization>("/organization");

    await saveProfile(profileName, { apiUrl, apiKey, organization: organization.name });

    if (flags.json) {
      json({ profile: profileName, organization: organization.name, apiUrl });
      return;
    }
    print(`${style.green("✓")} Signed in to ${style.bold(organization.name)} as profile ${profileName}`);
    info(style.dim(`Credentials stored in ${configDirectory()} with owner-only permissions.`));
  },
};

export const authStatus: Command = {
  name: "auth status",
  summary: "Show the active credentials and verify they still work",
  usage: "orbit auth status [--profile <name>]",
  offline: true,
  async run({ flags }) {
    const profile = await currentProfile(flags.profile);
    if (!profile) {
      if (flags.json) { json({ authenticated: false }); return 3; }
      fail("Not signed in. Run `orbit auth login`.");
      return 3;
    }

    const source = process.env.ORBIT_API_KEY ? "ORBIT_API_KEY environment variable" : "stored profile";
    const client = new OrbitClient(profile);

    let organization: Organization | undefined;
    let problem: string | undefined;
    try {
      organization = (await client.get<Organization>("/organization")).data;
    } catch (error) {
      // A stored key that has since been revoked should be reported as such,
      // not shown as though the session were fine.
      problem = error instanceof Error ? error.message : String(error);
    }

    if (flags.json) {
      json({
        authenticated: !problem,
        source,
        apiUrl: profile.apiUrl,
        key: maskKey(profile.apiKey),
        organization: organization?.name ?? profile.organization ?? null,
        plan: organization?.plan ?? null,
        error: problem ?? null,
      });
      return problem ? 3 : 0;
    }

    print(detail([
      ["Workspace", organization?.name ?? profile.organization ?? "unknown"],
      ["Plan", organization?.plan ?? "unknown"],
      ["API", profile.apiUrl],
      ["Key", maskKey(profile.apiKey)],
      ["Source", source],
      ["State", problem ? style.red(problem) : style.green("valid")],
    ]));
    return problem ? 3 : 0;
  },
};

export const authLogout: Command = {
  name: "auth logout",
  summary: "Remove stored credentials",
  usage: "orbit auth logout [--profile <name>] [--all]",
  offline: true,
  async run({ flags }) {
    if (flags.values.all === "true") {
      await clearConfig();
      print("Removed every stored profile.");
      return;
    }
    const name = flags.profile ?? (await listProfiles()).current;
    const removed = await removeProfile(name);
    if (!removed) {
      fail(`No stored profile named ${name}`);
      return 4;
    }
    print(`Removed profile ${name}.`);
    // Being explicit: logging out of the CLI does not stop the key working
    // anywhere else it has been used.
    info(style.dim("The key itself is still valid. Revoke it in the workspace to disable it everywhere."));
  },
};

export const authProfiles: Command = {
  name: "auth profiles",
  summary: "List stored profiles",
  usage: "orbit auth profiles",
  offline: true,
  async run({ flags }) {
    const { current, names } = await listProfiles();
    if (flags.json) { json({ current, profiles: names }); return; }
    if (names.length === 0) { info("No stored profiles."); return; }
    for (const name of names) {
      print(name === current ? `${style.green("*")} ${name}` : `  ${name}`);
    }
  },
};
