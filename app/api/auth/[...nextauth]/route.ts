import type { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { getEnv } from "@/lib/env";
import { normalizeEmail } from "@/lib/auth/profile";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, rateLimit, requestIp, safeErrorResponse } from "@/lib/auth/security";
export const runtime = "nodejs";
function configured(request: Request) {
  const env = getEnv();
  if (env.APP_MODE !== "live") throw new AppError("AUTH_NOT_CONFIGURED", "Sign-in requires the studio server configuration.", 503);
  if (new URL(request.url).host !== new URL(env.APP_URL).host) throw new AppError("INVALID_HOST", "Invalid sign-in host.", 403);
}
export async function GET(request: NextRequest) {
  try { configured(request); return await handlers.GET(request); } catch (error) { return safeErrorResponse(error); }
}
export async function POST(request: NextRequest) {
  try {
    configured(request);
    assertSameOrigin(request);
    await rateLimit("auth-ip", requestIp(request), 15, 60 * 15);
    if (new URL(request.url).pathname.endsWith("/signin/resend")) {
      const data = await request.clone().formData();
      const email = normalizeEmail(String(data.get("email") || ""));
      await rateLimit("magic-link-email", email, 3, 60 * 15);
    }
    return await handlers.POST(request);
  } catch (error) { return safeErrorResponse(error); }
}
