# Testing the CLI

## Prerequisites

The API must be running. From the repo root:

```
npm run dev
```

That starts the API on `4400`, the workers, and the web app on `5173`.

## 1. Unit tests

No API needed — these cover argument parsing, exit codes, key masking, and
output formatting:

```
npm test -w cli
```

## 2. Get a key

```
bash cli/scripts/make-key.sh
```

Prints the secret once. The API never shows it again, by design.

For a deliberately limited key, pass the scopes:

```
bash cli/scripts/make-key.sh '"servers:read","files:read"'
```

## 3. Point the CLI at it

```
export ORBIT_API_KEY=orb_...        # the secret from step 2
export ORBIT_API_URL=http://127.0.0.1:4400/api/v1
```

On Git Bash for Windows also set `export MSYS_NO_PATHCONV=1`, or the shell
rewrites remote paths like `/srv/app.txt` into `C:/Program Files/Git/srv/...`
before the CLI ever sees them.

Alternatively, store it instead of using the environment:

```
npm run dev -w cli -- auth login
```

## 4. Run it

Against the source, no build step:

```
npm run dev -w cli -- servers ls
```

Or build once and run the binary:

```
npm run build -w cli
node cli/dist/index.js servers ls
```

## What to try

```
orbit auth status                          # verifies the key still works
orbit servers ls                           # live status and latency
orbit servers show TEEBLING                # full detail; name or id prefix works
orbit servers test TEEBLING                # opens a real connection now

orbit files ls TEEBLING --long             # real listing from the host
orbit files put TEEBLING local.txt /srv/f.txt --note "why"
orbit files cat TEEBLING /srv/f.txt
orbit files get TEEBLING /srv/f.txt out.txt   # checksum-verified before writing
orbit files rm TEEBLING /srv/f.txt --yes

orbit backups create TEEBLING --name test --wait   # queues, then polls to done
orbit backups ls
orbit status                               # workspace summary
```

A server can be named by full id, by the shortened id `servers ls` prints, or
by name.

## Checking the behaviour that matters

**Scopes are enforced.** With a read-only key, a write is refused rather than
warned:

```
ORBIT_API_KEY=<read-only key> orbit files mkdir TEEBLING /nope
# × This API key does not carry the files:write scope
echo $?   # 5
```

**Exit codes distinguish the failure**, so CI can branch on the reason:

| Code | Meaning |
| ---- | ------- |
| 0 | Success |
| 2 | Usage error |
| 3 | Not authenticated, or the key was revoked |
| 4 | Not found |
| 5 | The key lacks the required scope |
| 6 | Conflict |
| 7 | Server error |
| 8 | Could not reach the API |

```
ORBIT_API_KEY=orb_invalid orbit servers ls;  echo $?   # 3
orbit files cat TEEBLING /does-not-exist;    echo $?   # 4
ORBIT_API_URL=http://127.0.0.1:9999/api/v1 orbit status; echo $?   # 8
```

**Confirmation is required without a terminal.** In a pipeline, a destructive
command refuses rather than assuming yes:

```
orbit files rm TEEBLING /srv/x.txt < /dev/null
# × Delete /srv/x.txt? — refusing without a terminal. Pass --yes to confirm.
```

**Machine output stays parseable.** Data goes to stdout, progress and warnings
to stderr:

```
orbit servers ls --json | jq -r '.[] | select(.status=="offline") | .name'
```
