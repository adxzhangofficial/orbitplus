import type { MembershipRole, PlatformRole } from "../middleware/auth.js";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        userId: string;
        email: string;
        platformRole: PlatformRole;
        /** Present when the caller authenticated with an API key. */
        apiKeyId?: string;
        /** Scopes the key carries; absent for a user session, which is unscoped. */
        scopes?: string[];
      };
      /** An API key is pinned to its own tenant and cannot be redirected. */
      apiKeyOrganizationId?: string;
      tenant?: {
        organizationId: string;
        organizationName: string;
        /** Drives plan-limit enforcement without a query in every handler. */
        plan: string;
        role: MembershipRole;
      };
    }
  }
}

export {};
