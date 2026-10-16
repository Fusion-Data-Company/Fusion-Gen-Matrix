import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { Profile } from "@/lib/types";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { repository } from "@/lib/db/repository";
import { changeCredits } from "@/lib/billing/ledger";
import { ensureProfile, normalizeEmail } from "./profile";
import { assertLocalPreview, assertSameOrigin, rateLimit, requestIp } from "./security";

const cookieName = "fusion.preview-session";
const sessionSeconds = 60 * 60 * 12;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
async function activeRequest(request?: Request) {
  return request || new Request(getEnv().APP_URL, { headers: await headers() });
}
function readCookie(request: Request) {
  const raw = request.headers.get("cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(cookieName + "="));
  return raw?.slice(cookieName.length + 1);
}
export async function currentUser(request?: Request): Promise<Profile | null> {
  if (getEnv().APP_MODE === "demo") {
    const req = await activeRequest(request);
    assertLocalPreview(req);
    const token = readCookie(req);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return repository().read(async tx => {
      const session = await tx.get("preview_sessions", hash(token));
      if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
      return tx.get("profiles", session.userId);
    });
  }
  if (getEnv().APP_MODE !== "live") return null;
  const { auth } = await import("@/auth");
  const session = await auth();
  if (!session?.user?.id) return null;
  const existing = await repository().read(tx => tx.get("profiles", session.user.id));
  if (!existing) return null;
  return ensureProfile(existing.id, existing.email, existing.name);
}
export async function requireUser(request?: Request) {
  const user = await currentUser(request);
  if (!user) throw new AppError("UNAUTHENTICATED", "Sign in to continue.", 401);
  return user;
}
export async function requireAdmin(request?: Request) {
  const user = await requireUser(request);
  if (user.role !== "admin") throw new AppError("NOT_FOUND", "This page is unavailable.", 404);
  return user;
}
export async function demoLogin(emailValue: string, request: Request) {
  assertLocalPreview(request);
  assertSameOrigin(request);
  const email = normalizeEmail(emailValue);
  await rateLimit("preview-login", requestIp(request), 30, 60);
  const id = "preview_" + hash(email).slice(0, 24);
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + sessionSeconds * 1000).toISOString();
  const previous = readCookie(request);
  const user = await repository().transaction(async tx => {
    let profile = await tx.get("profiles", id);
    if (!profile) {
      profile = { id, email, name: email === "operator@preview.local" ? "Preview operator" : email.split("@")[0],
        role: email === "operator@preview.local" ? "admin" : "user", plan: "free",
        subscriptionCredits: 0, topupCredits: 0, createdAt: new Date().toISOString() };
      await tx.insert("profiles", profile);
      profile = await changeCredits(tx, profile, 200, "topup", "preview_signup", id, "Local preview credits. No cash value.");
    }
    if (previous && /^[a-f0-9]{64}$/.test(previous)) await tx.remove("preview_sessions", hash(previous));
    await tx.insert("preview_sessions", { id: hash(token), userId: id, expiresAt });
    return profile;
  });
  (await cookies()).set(cookieName, token, { httpOnly: true, sameSite: "strict", secure: new URL(getEnv().APP_URL).protocol === "https:", path: "/", maxAge: sessionSeconds });
  return user;
}
export async function demoLogout() {
  const request = await activeRequest();
  assertLocalPreview(request);
  assertSameOrigin(request);
  const token = readCookie(request);
  if (token && /^[a-f0-9]{64}$/.test(token)) await repository().transaction(tx => tx.remove("preview_sessions", hash(token)));
  (await cookies()).delete(cookieName);
}

export { assertLocalPreview } from "./security";
