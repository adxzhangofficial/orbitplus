import type { MembershipRole, PlatformRole } from "../middleware/auth.js";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        userId: string;
        email: string;
        platformRole: PlatformRole;
      };
      tenant?: {
        organizationId: string;
        organizationName: string;
        role: MembershipRole;
      };
    }
  }
}

export {};
