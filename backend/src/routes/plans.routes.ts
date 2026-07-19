import { Router } from "express";

export const plansRouter = Router();

plansRouter.get("/plans", (_request, response) => {
  response.json({
    data: [
      {
        id: "free",
        name: "Free",
        monthlyPrice: 0,
        yearlyPrice: 0,
        description: "A focused workspace for individual developers.",
        limits: { members: 1, workspaces: 1, servers: 2, backupRetentionDays: 3 },
        features: ["Secure SFTP explorer", "Manual transfers", "File version history", "Community support"],
      },
      {
        id: "pro",
        name: "Pro",
        monthlyPrice: 29,
        yearlyPrice: 290,
        description: "Automation, observability, and collaboration for growing teams.",
        popular: true,
        limits: { members: 10, workspaces: 10, servers: 50, backupRetentionDays: 30 },
        features: ["Everything in Free", "Scheduled backups", "Deployment rollback", "Automations", "Live monitoring", "Priority support"],
      },
      {
        id: "enterprise",
        name: "Enterprise",
        monthlyPrice: null,
        yearlyPrice: null,
        description: "Governed server operations for complex organizations.",
        limits: { members: null, workspaces: null, servers: null, backupRetentionDays: null },
        features: ["Everything in Pro", "Advanced RBAC", "SSO and SCIM", "Private workers", "Immutable audit", "Custom retention", "SLA support"],
      },
    ],
  });
});
