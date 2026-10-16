import "server-only";
import NextAuth from "next-auth";
import ResendProvider from "next-auth/providers/resend";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { mongoClient } from "@/lib/db/mongo";
import { getEnv } from "@/lib/env";
import { ensureProfile, normalizeEmail, liveRole } from "@/lib/auth/profile";
import { sendMagicLink } from "@/lib/billing/email";

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const env = getEnv();
  if (env.APP_MODE !== "live") return { providers: [], session: { strategy: "database" as const }, trustHost: false };
  return {
    adapter: MongoDBAdapter(mongoClient, { databaseName: env.MONGODB_DB }),
    secret: process.env.AUTH_SECRET,
    trustHost: true,
    useSecureCookies: true,
    session: { strategy: "database" as const, maxAge: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 12 },
    providers: [ResendProvider({
      apiKey: process.env.AUTH_RESEND_KEY, from: process.env.EMAIL_FROM, maxAge: 10 * 60,
      normalizeIdentifier: normalizeEmail,
      async sendVerificationRequest({ identifier, url }) { await sendMagicLink(identifier, url); }
    })],
    pages: { signIn: "/login", verifyRequest: "/login/check-email", error: "/login/error" },
    callbacks: {
      async session({ session, user }) {
        return { expires: session.expires, user: { id: user.id, role: liveRole(user.email || "") } };
      },
      async redirect({ url }) {
        try { const destination = new URL(url, env.APP_URL); return destination.origin === new URL(env.APP_URL).origin ? destination.href : env.APP_URL; }
        catch { return env.APP_URL; }
      }
    },
    events: {
      async createUser({ user }) { if (user.id && user.email) await ensureProfile(user.id, user.email, user.name); },
      async signIn({ user }) { if (user.id && user.email) await ensureProfile(user.id, user.email, user.name); }
    },
    logger: { error() { console.error("Authentication failed."); }, warn(code) { console.warn("Authentication warning:", code); }, debug() {} }
  };
});
