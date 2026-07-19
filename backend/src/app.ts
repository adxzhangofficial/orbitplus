import compression from "compression";
import cors from "cors";
import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import { activityRouter } from "./routes/activity.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { agentRouter } from "./routes/agent.routes.js";
import { apiKeysRouter } from "./routes/api-keys.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { automationsRouter } from "./routes/automations.routes.js";
import { backupsRouter } from "./routes/backups.routes.js";
import { billingRouter } from "./routes/billing.routes.js";
import { deploymentsRouter } from "./routes/deployments.routes.js";
import { filesRouter } from "./routes/files.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { integrationsRouter } from "./routes/integrations.routes.js";
import { monitoringRouter } from "./routes/monitoring.routes.js";
import { notificationsRouter } from "./routes/notifications.routes.js";
import { organizationRouter } from "./routes/organization.routes.js";
import { overviewRouter } from "./routes/overview.routes.js";
import { plansRouter } from "./routes/plans.routes.js";
import { profileRouter } from "./routes/profile.routes.js";
import { runbooksRouter } from "./routes/runbooks.routes.js";
import { serversRouter } from "./routes/servers.routes.js";
import { statusRouter } from "./routes/status.routes.js";
import { teamRouter } from "./routes/team.routes.js";
import { terminalRouter } from "./routes/terminal.routes.js";
import { transfersRouter } from "./routes/transfers.routes.js";
import { webhooksRouter } from "./routes/webhooks.routes.js";
import { workspacesRouter } from "./routes/workspaces.routes.js";
import { authenticate, requirePlatformAdmin, requireScope, resolveTenant } from "./middleware/auth.js";
import { auditMutations } from "./middleware/audit.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestContext } from "./middleware/request-context.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(requestContext);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({
    origin: env.FRONTEND_URL.split(",").map((origin) => origin.trim()),
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Organization-Id", "X-Request-Id", "X-Orbit-Client"],
  }));
  app.use(compression());

  // Webhooks mount before express.json: signature verification runs over the
  // exact bytes the provider signed, and parsing would change them.
  app.use("/api/v1/webhooks", webhooksRouter);

  app.use(express.json({ limit: "4mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(auditMutations);

  const api = Router();
  api.use(healthRouter);
  api.use(plansRouter);
  api.use(statusRouter);
  // Machine-authenticated: agents present their own token, not a user session.
  api.use("/agent", agentRouter);
  api.use("/auth", rateLimit({ windowMs: 60_000, limit: env.NODE_ENV === "test" ? 1_000 : 20, standardHeaders: "draft-8", legacyHeaders: false }), authRouter);

  const account = Router();
  account.use(authenticate);
  account.use("/profile", profileRouter);
  api.use(account);

  const customer = Router();
  customer.use(authenticate, resolveTenant);
  customer.use("/overview", overviewRouter);
  customer.use("/organization", organizationRouter);
  customer.use("/workspaces", workspacesRouter);
  customer.use("/api-keys", apiKeysRouter);
  customer.use("/servers/:serverId/files", requireScope("files:read"), filesRouter);
  customer.use("/servers", requireScope("servers:read"), serversRouter);
  customer.use("/transfers", requireScope("transfers:read"), transfersRouter);
  customer.use("/backups", requireScope("backups:read"), backupsRouter);
  customer.use("/deployments", requireScope("deployments:read"), deploymentsRouter);
  customer.use("/automations", automationsRouter);
  customer.use("/monitoring", requireScope("monitoring:read"), monitoringRouter);
  customer.use("/activity", requireScope("activity:read"), activityRouter);
  customer.use("/notifications", notificationsRouter);
  customer.use("/team", teamRouter);
  customer.use("/billing", billingRouter);
  customer.use("/integrations", integrationsRouter);
  customer.use("/runbooks", runbooksRouter);
  customer.use("/terminal", terminalRouter);
  const admin = Router();
  admin.use(authenticate, requirePlatformAdmin);
  admin.use(adminRouter);
  // Mount platform routes before the catch-all customer router so an admin is
  // never forced through tenant resolution just to operate the control plane.
  api.use("/admin", admin);
  api.use(customer);

  app.use("/api/v1", api);

  // The frontend remains an independently built application. In production the API can
  // serve its compiled artifact so a single process is enough for a small deployment;
  // larger installations can place the same frontend/dist directory behind a CDN.
  const frontendDist = fileURLToPath(new URL("../../frontend/dist", import.meta.url));
  if (env.NODE_ENV === "production" && existsSync(frontendDist)) {
    app.use(express.static(frontendDist, { immutable: true, maxAge: "1y", index: false }));
    app.use((request, response, next) => {
      if (request.method !== "GET" || request.path.startsWith("/api/") || !request.accepts("html")) return next();
      return response.sendFile("index.html", { root: frontendDist, headers: { "Cache-Control": "no-cache" } });
    });
  }
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

export const app = createApp();
