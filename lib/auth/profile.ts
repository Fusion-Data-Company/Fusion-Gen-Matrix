import "server-only";
import { z } from "zod";
import type { Profile } from "@/lib/types";
import type { Repository } from "@/lib/db/repository";
import { repository } from "@/lib/db/repository";
import { changeCredits } from "@/lib/billing/ledger";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

export function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!z.email().max(254).safeParse(email).success) throw new AppError("INVALID_EMAIL", "Enter one valid email address.");
  return email;
}
export function liveRole(email: string): Profile["role"] {
  const allowed = (process.env.ADMIN_EMAILS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.toLowerCase()) ? "admin" : "user";
}
export async function ensureProfile(id: string, emailValue: string, name?: string | null, db: Repository = repository()) {
  const email = normalizeEmail(emailValue);
  return db.transaction(async tx => {
    const existing = await tx.get("profiles", id);
    const role = liveRole(email);
    if (existing) {
      if (existing.role === role && existing.email === email) return existing;
      const updated = { ...existing, role, email };
      await tx.put("profiles", updated);
      return updated;
    }
    let profile: Profile = { id, email, name: name?.slice(0, 100) || email.split("@")[0], role, plan: "free",
      subscriptionCredits: 0, topupCredits: 0, createdAt: new Date().toISOString() };
    await tx.insert("profiles", profile);
    const bonus = getEnv().SIGNUP_BONUS_CREDITS;
    if (bonus) profile = await changeCredits(tx, profile, bonus, "topup", "signup_bonus", id);
    return profile;
  });
}
