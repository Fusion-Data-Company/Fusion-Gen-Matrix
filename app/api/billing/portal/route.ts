import { requireUser } from "@/lib/auth/server";
import { assertSameOrigin, rateLimit, safeErrorResponse } from "@/lib/auth/security";
import { createPortal } from "@/lib/billing/stripe";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    await rateLimit("billing-portal", user.id, 10, 60);
    return Response.json(await createPortal(user));
  } catch (error) { return safeErrorResponse(error); }
}
