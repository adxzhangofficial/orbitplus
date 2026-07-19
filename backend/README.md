# Orbit+ API

TypeScript/Express API for the Orbit+ server operations workspace. It uses PostgreSQL for tenant-scoped application state, AES-256-GCM for stored server credentials, and adapter-based remote file access.

## Local setup

1. Copy `.env.example` to `.env` and supply local values. Never commit `.env`.
   To install the known demo accounts, explicitly set `ALLOW_DEVELOPMENT_SEED=true`
   and set `SEED_DATABASE_NAME` to the exact local database name.
2. From the workspace root, run `npm install`.
3. Run `npm run db:migrate -w backend`.
4. Run `npm run db:seed -w backend` for the local demo tenant.
5. Run `npm run dev -w backend`.

The API defaults to `http://127.0.0.1:4400/api/v1`.

Seeded development accounts:

- Customer: `demo@orbit.dev` / `OrbitDemo123!`
- Platform admin: `admin@orbit.dev` / `OrbitAdmin123!`

These accounts are for local development only.

## API conventions

Authenticated requests use `Authorization: Bearer <token>`. Customer routes also accept `X-Organization-Id`; if omitted, the user's highest-ranked active membership is selected. Responses use `{ "data": ... }`. Errors use `{ "error": { "code", "message", "details?", "requestId" } }`.

Public endpoints:

- `GET /health`, `GET /ready`, `GET /plans`
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`

Customer endpoints:

- `/overview`, `/organization`, `/workspaces`
- `/servers` and `/servers/:serverId/files`
- `/transfers`, `/backups`, `/deployments`, `/automations`
- `/monitoring`, `/activity`, `/notifications`, `/team`, `/billing`

Platform endpoints:

- `/admin/overview`, `/admin/customers`, `/admin/system`, `/admin/activity`

## Safety model

- Membership roles are `viewer`, `developer`, `admin`, and `owner`; all customer resources are filtered by organization.
- SFTP secrets are never returned by API queries and are encrypted at rest with AES-256-GCM.
- Real SFTP connections require a pinned SHA-256 host fingerprint.
- Remote paths are normalized and confined to the configured server root.
- File writes use unique temporary files and atomic rename where supported.
- File changes capture versions and support optimistic checksum checks and rollback. Version payloads are encrypted with AES-256-GCM at the application layer and authenticated against their tenant, server, path, and checksum metadata.
- Demo-mode files are isolated under ignored `backend/storage/` directories by organization and server.
- Mutation requests write audit records with actor, tenant, request ID, IP, and result status.

## Verification

Production builds package SQL migrations into `dist/database/migrations`. Apply
them before starting a release with `npm run db:migrate:production -w backend`.
Startup and `/ready` both reject a database with pending or incomplete schema.

Integration tests never use `DATABASE_URL`. Supply a dedicated database whose
name explicitly contains `test`, for example:

```powershell
$env:TEST_DATABASE_URL = "postgresql://.../orbit_test"
```

Then run:

```powershell
npm run typecheck -w backend
npm run build -w backend
npm run db:migrate -w backend
npm run db:seed -w backend
npm run test -w backend
```
