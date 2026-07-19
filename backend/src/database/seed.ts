import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { DemoSftpAdapter } from "../adapters/demo-sftp.adapter.js";
import type { ServerConnectionRecord } from "../adapters/remote-filesystem.js";
import { encryptJson } from "../lib/crypto.js";
import { closePool, pool } from "./pool.js";
import { env } from "../config/env.js";
import { assertSeedAllowed } from "./seed-policy.js";

export async function seed(): Promise<void> {
  assertSeedAllowed({
    nodeEnv: env.NODE_ENV,
    allowDevelopmentSeed: env.ALLOW_DEVELOPMENT_SEED,
    expectedDatabaseName: env.SEED_DATABASE_NAME,
    databaseUrl: env.DATABASE_URL,
  });
  const client = await pool.connect();
  let demoUserId: string;
  let adminUserId: string;
  let organizationId: string;
  let workspaceId: string;
  let serverId: string;
  try {
    await client.query("BEGIN");
    const [demoPasswordHash, adminPasswordHash] = await Promise.all([
      bcrypt.hash("OrbitDemo123!", 12),
      bcrypt.hash("OrbitAdmin123!", 12),
    ]);
    const demoUser = await client.query<{ id: string }>(
      `INSERT INTO users(email, password_hash, name, platform_role, active, email_verified)
       VALUES('demo@orbit.dev',$1,'Alex Morgan','user',true,true)
       ON CONFLICT(lower(email)) DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, active = true
       RETURNING id`, [demoPasswordHash]);
    demoUserId = demoUser.rows[0]!.id;
    const adminUser = await client.query<{ id: string }>(
      `INSERT INTO users(email, password_hash, name, platform_role, active, email_verified)
       VALUES('admin@orbit.dev',$1,'Orbit Administrator','admin',true,true)
       ON CONFLICT(lower(email)) DO UPDATE SET password_hash = EXCLUDED.password_hash, platform_role = 'admin', active = true
       RETURNING id`, [adminPasswordHash]);
    adminUserId = adminUser.rows[0]!.id;

    const organization = await client.query<{ id: string }>(
      `INSERT INTO organizations(name, slug, plan, status, settings)
       VALUES('Nebula Labs','orbit-demo','pro','active','{"timezone":"UTC","defaultEnvironment":"production","requireBackupBeforeWrite":false}'::jsonb)
       ON CONFLICT(slug) DO UPDATE SET name = EXCLUDED.name, plan = EXCLUDED.plan, status = 'active'
       RETURNING id`);
    organizationId = organization.rows[0]!.id;
    await client.query(
      `INSERT INTO memberships(organization_id, user_id, role, status)
       VALUES($1,$2,'owner','active') ON CONFLICT(organization_id,user_id) DO UPDATE SET role = 'owner', status = 'active'`,
      [organizationId, demoUserId]);
    await client.query(
      `INSERT INTO memberships(organization_id, user_id, role, status)
       VALUES($1,$2,'admin','active') ON CONFLICT(organization_id,user_id) DO UPDATE SET role = 'admin', status = 'active'`,
      [organizationId, adminUserId]);

    const workspace = await client.query<{ id: string }>(
      `INSERT INTO workspaces(organization_id, name, slug, description, environment, created_by)
       VALUES($1,'Orbit Production','production','Primary production operations workspace','production',$2)
       ON CONFLICT(organization_id,slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
       RETURNING id`, [organizationId, demoUserId]);
    workspaceId = workspace.rows[0]!.id;

    const server = await client.query<{ id: string }>(
      `INSERT INTO server_connections
         (organization_id,workspace_id,name,description,host,port,username,root_path,environment,adapter_mode,authentication_type,credential_ciphertext,status,last_checked_at,last_latency_ms,settings,created_by)
       VALUES($1,$2,'Demo Production Server','Tenant-isolated SFTP sandbox','demo.orbit.local',22,'deploy','/','production','demo','password',$3,'online',now(),8,'{"concurrency":4,"ignorePatterns":[".git","node_modules"]}'::jsonb,$4)
       ON CONFLICT(organization_id,name) DO UPDATE SET workspace_id = EXCLUDED.workspace_id, status = 'online', last_checked_at = now()
       RETURNING id`, [organizationId, workspaceId, encryptJson({ password: "demo-adapter-only" }), demoUserId]);
    serverId = server.rows[0]!.id;

    await client.query(
      `INSERT INTO subscriptions(organization_id,plan,status,interval,amount_cents,currency)
       VALUES($1,'pro','active','monthly',2900,'USD')
       ON CONFLICT(organization_id) DO UPDATE SET plan = 'pro', status = 'active', amount_cents = 2900`, [organizationId]);
    await client.query(
      `INSERT INTO invoices(organization_id,invoice_number,amount_cents,currency,status,paid_at)
       VALUES($1,'ORB-DEMO-0001',2900,'USD','paid',now() - interval '5 days') ON CONFLICT(invoice_number) DO NOTHING`, [organizationId]);
    await client.query(
      `INSERT INTO automations(organization_id,name,description,trigger_type,schedule,action_type,configuration,enabled,next_run_at,created_by)
       SELECT $1,'Nightly production backup','Snapshot production before the next deployment','schedule','0 2 * * *','backup',jsonb_build_object('serverId',$2::text,'path','/'),true,now()+interval '1 day',$3
       WHERE NOT EXISTS(SELECT 1 FROM automations WHERE organization_id=$1 AND name='Nightly production backup')`, [organizationId, serverId, demoUserId]);
    await client.query(
      `INSERT INTO monitors(organization_id,server_id,status,cpu_percent,memory_percent,disk_percent,latency_ms,services)
       SELECT $1,$2,'healthy',23.4,48.8,61.2,8,'[{"name":"sftp","status":"up"},{"name":"nginx","status":"up"}]'::jsonb
       WHERE NOT EXISTS(SELECT 1 FROM monitors WHERE organization_id=$1 AND server_id=$2)`, [organizationId, serverId]);
    await client.query(
      `INSERT INTO alerts(organization_id,server_id,severity,title,message,status)
       SELECT $1,$2,'warning','Disk usage trend','Disk usage is projected to exceed 80% within 14 days.','open'
       WHERE NOT EXISTS(SELECT 1 FROM alerts WHERE organization_id=$1 AND title='Disk usage trend')`, [organizationId, serverId]);
    await client.query(
      `INSERT INTO notifications(organization_id,user_id,type,title,message,link)
       SELECT $1,$2,'success','Workspace ready','Your secure Orbit+ demo workspace is ready to explore.','/app/servers'
       WHERE NOT EXISTS(SELECT 1 FROM notifications WHERE organization_id=$1 AND user_id=$2 AND title='Workspace ready')`, [organizationId, demoUserId]);
    await client.query(
      `INSERT INTO deployments(organization_id,workspace_id,server_id,name,environment,version,status,commit_sha,created_by,completed_at)
       SELECT $1,$2,$3,'Web application','production','v2.4.1','succeeded','e8a91c2',$4,now()-interval '2 hours'
       WHERE NOT EXISTS(SELECT 1 FROM deployments WHERE organization_id=$1 AND version='v2.4.1')`, [organizationId, workspaceId, serverId, demoUserId]);
    await client.query(
      `INSERT INTO transfers(organization_id,server_id,name,direction,source_path,destination_path,status,progress,bytes_total,bytes_transferred,created_by,started_at,completed_at)
       SELECT $1,$2,'Release assets','upload','local://dist','/var/www/app','completed',100,1843200,1843200,$3,now()-interval '3 hours',now()-interval '3 hours'+interval '18 seconds'
       WHERE NOT EXISTS(SELECT 1 FROM transfers WHERE organization_id=$1 AND name='Release assets')`, [organizationId, serverId, demoUserId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const adapter = new DemoSftpAdapter({
    id: serverId!, organization_id: organizationId!, workspace_id: workspaceId!, name: "Demo Production Server",
    host: "demo.orbit.local", port: 22, username: "deploy", root_path: "/", adapter_mode: "demo",
    authentication_type: "password", credential_ciphertext: null, host_fingerprint: null, settings: {},
  } satisfies ServerConnectionRecord);
  await adapter.connect();
  try {
    await adapter.mkdir("/var/www/app/src");
    await adapter.mkdir("/var/www/app/config");
    await adapter.mkdir("/logs");
    await adapter.write("/README.md", Buffer.from("# Orbit+ Demo Server\n\nThis tenant-isolated filesystem is safe to edit, version, back up, and restore.\n"));
    await adapter.write("/var/www/app/package.json", Buffer.from(JSON.stringify({ name: "nebula-web", version: "2.4.1", private: true, scripts: { start: "node server.js" } }, null, 2) + "\n"));
    await adapter.write("/var/www/app/src/server.js", Buffer.from("import express from 'express';\nconst app = express();\napp.get('/health', (_req, res) => res.json({ status: 'ok' }));\napp.listen(8080);\n"));
    await adapter.write("/var/www/app/config/production.json", Buffer.from(JSON.stringify({ port: 8080, logLevel: "info", maintenance: false }, null, 2) + "\n"));
    await adapter.write("/logs/application.log", Buffer.from("2026-07-19T00:00:00Z INFO Application started\n2026-07-19T00:00:01Z INFO Health check passed\n"));
  } finally { await adapter.disconnect(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  seed()
    .then(() => console.log("Database seed complete"))
    .catch((error) => { console.error("Database seed failed", error instanceof Error ? error.message : error); process.exitCode = 1; })
    .finally(closePool);
}
