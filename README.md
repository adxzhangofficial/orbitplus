# Orbit+ Server Workspace

Orbit+ is a full-stack, multi-tenant server operations workspace inspired by the proven workflow boundaries in the `vscode-sftp-1.16.3` extension and the midnight internal-dashboard language in `design-components-theme`.

The frontend and backend are independent applications. They share only the root npm workspace and HTTP API contract.

## Applications

### Public frontend

- Product home, product tour, features, integrations, customers, enterprise, security, pricing, docs, and API reference
- Changelog, roadmap, live-style status page, about, and contact
- Sign in, registration, password recovery/reset, and email verification
- Terms, privacy, and acceptable-use pages
- Exactly three plans: Free, Pro, and Enterprise

### Customer workspace

- Overview, server inventory, connection health, environments, and tags
- Remote file explorer, safe editor, diff, version history, and rollback
- Upload/download/sync queue with progress, retry, cancellation, and filters
- Encrypted backups, retention, restore workflow, and recovery visibility
- Git-aware deployments, approvals, release history, and rollback
- Terminal sessions, saved runbooks, automations, monitoring, and alerts
- Activity/audit, notifications, members, roles, integrations, API keys
- Usage, billing, profile, security, and workspace settings

### Platform admin control plane

- Platform overview, organizations, users/access, and server fleet
- Jobs/queues, backup storage, plans, subscriptions, usage, and revenue
- Security incidents, immutable audit, support desk, feature flags
- Announcements and system configuration

## Backend capabilities

- Express 5 + TypeScript API under `/api/v1`
- PostgreSQL migrations and idempotent seed
- JWT authentication, tenant resolution, RBAC, and platform-admin authorization
- AES-256-GCM server credential encryption
- Demo sandbox plus real SFTP adapter with mandatory pinned SHA-256 host fingerprint
- Canonical, root-confined remote paths and tenant-scoped server access
- Unique temporary uploads and atomic replacement
- Content checksums and optimistic concurrency protection
- File versions and rollback
- Actual encrypted-metadata filesystem snapshots/restores in local development
- Transfers, deployments, automations, monitoring, alerts, audit, notifications, teams, and billing
- Health and readiness endpoints, rate limits, security headers, structured errors
- Production fallback that serves the separately compiled frontend artifact

## Project structure

```text
orbit+ server workspace/
├─ frontend/                  React 19 + Vite + TypeScript
│  ├─ src/pages/public/      Separate public route components
│  ├─ src/pages/workspace/   Separate customer route components
│  ├─ src/pages/admin/       Separate platform-admin route components
│  ├─ src/components/        Shells, theme, and reusable UI
│  └─ src/lib/               API client, data types, and utilities
├─ backend/                   Express + PostgreSQL + SFTP
│  ├─ src/routes/            Domain HTTP modules
│  ├─ src/services/          Files, servers, backups, and policies
│  ├─ src/adapters/          Demo and real SFTP implementations
│  ├─ src/database/          Pool, migration, schema, and seed
│  └─ src/tests/             API integration tests
└─ package.json              Workspace commands only
```

## Run locally

Requirements: Node.js 22+ and PostgreSQL 18+.

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

`npm run dev` starts three processes: the API, the job worker, and the web app.
The worker is not optional. Transfers, backups, scheduled automations, and
remote tree indexing are all queued rather than run inside the request, so
without it those actions are accepted and then never execute.

Run each separately with `npm run dev:api`, `npm run dev:worker`, and
`npm run dev:web` when you want their logs apart.

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:4400/api/v1`
- Health: `http://127.0.0.1:4400/api/v1/health`

The local database connection is already stored in ignored `backend/.env`. Never commit that file. Portable placeholders live in `backend/.env.example` and `frontend/.env.example`.

### Seeded application accounts

- Customer: `demo@orbit.dev` / `OrbitDemo123!`
- Platform admin: `admin@orbit.dev` / `OrbitAdmin123!`

These are development-only identities. Change or remove them before any deployment.

## Verification

```bash
npm run typecheck
npm run test
npm run build
```

For production after a build:

```bash
npm start
```

The backend serves `frontend/dist` in production while the codebases remain independently buildable and deployable. The same frontend can instead be hosted on a CDN with `VITE_API_URL` pointed at the API.

## Real SFTP connections

The seeded server uses the isolated demo adapter. A real connection must provide:

- SFTP host, port, user, and canonical allowed root
- Password, private key, or SSH-agent authentication
- A pinned SHA-256 SSH host fingerprint
- An organization member with sufficient role permission

Plain FTP is intentionally not enabled. Secret values are encrypted before storage and are never returned through public server responses.

See [`backend/README.md`](./backend/README.md) for the API route map and backend-specific details.
