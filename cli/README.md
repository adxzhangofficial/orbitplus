# Orbit CLI

Scriptable access to the same API the workspace uses.

## Install

```
npm install -g @orbit/cli
```

## Authenticate

Create an API key in the workspace under **Settings → API keys**, then:

```
orbit auth login
```

The key is verified before it is stored, and written to your user config
directory with owner-only permissions. For CI, set `ORBIT_API_KEY` instead —
the environment always wins over a stored profile, so a pipeline never has to
write a dotfile.

Scopes are enforced. A key granted `files:read` cannot write, and the CLI
reports that as exit code 5 rather than a generic failure.

## Commands

```
orbit servers ls                              # connected servers, live status
orbit servers show <server>                   # one server in full
orbit servers test <server>                   # open a connection now

orbit files ls <server> [path] [--long]       # list a directory
orbit files cat <server> <path>               # print a file
orbit files get <server> <remote> [local]     # download, checksum-verified
orbit files put <server> <local> <remote>     # upload, versioned
orbit files rm <server> <path> [--recursive]  # delete, snapshot kept
orbit files mkdir <server> <path>
orbit files mv <server> <from> <to>

orbit backups ls
orbit backups create <server> --name X --wait # queue and wait for the result
orbit backups restore <backup> --yes --wait
orbit backups show <backup>

orbit transfers ls
orbit activity ls                             # audit trail
orbit status                                  # workspace summary
```

A server can be named by full id, by id prefix as shown in `servers ls`, or by
name: `orbit files ls production /var/www`.

Paths default to the server's configured root rather than `/`, because a
connection is scoped to that root and anything above it is refused.

## Scripting

`--json` puts machine-readable output on stdout; progress and warnings go to
stderr, so a pipe stays parseable:

```
orbit servers ls --json | jq -r '.[] | select(.status=="offline") | .name'
```

Exit codes distinguish what went wrong:

| Code | Meaning |
| ---- | ------- |
| 0 | Success |
| 2 | Usage error |
| 3 | Not authenticated, or the key was revoked |
| 4 | Not found |
| 5 | The key lacks the required scope |
| 6 | Conflict — already published, already running |
| 7 | Server error |
| 8 | Could not reach the API |

Anything that cannot be undone asks first. Without a terminal it refuses rather
than assuming yes, so `--yes` is required in a pipeline:

```
orbit backups create production --name nightly --wait || exit 1
orbit files rm production /tmp/stale --recursive --yes
```

## Environment

| Variable | Purpose |
| -------- | ------- |
| `ORBIT_API_KEY` | Credentials; overrides any stored profile |
| `ORBIT_API_URL` | API base including `/api/v1` (default `http://127.0.0.1:4400/api/v1`) |
| `ORBIT_PROFILE` | Which stored profile to use |
| `ORBIT_CONFIG_DIR` | Where credentials live |
| `NO_COLOR` | Disable colour |
| `ORBIT_DEBUG` | Print stack traces on unexpected errors |
