import type { DefaultSession } from "next-auth";
import type { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: string;
      organizationId: string | null;
      organizationIndustry?: string | null;
      organizationConstructionTrade?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    email?: string | null;
    id?: string;
    role?: string;
    organizationId?: string | null;
    organizationIndustry?: string | null;
    organizationConstructionTrade?: string | null;
    name?: string | null;
    picture?: string | null;
  }
}
