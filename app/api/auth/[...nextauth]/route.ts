import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

// אתחול ה-Handler עבור GET ו-POST
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
