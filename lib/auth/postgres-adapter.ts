import "server-only";
import PostgresAdapter from "@auth/pg-adapter";
import type { Adapter, AdapterSession, AdapterUser, VerificationToken } from "next-auth/adapters";
import type { Pool } from "pg";

/** Official adapter plus atomic partial updates and expiry checks. IDs remain strings. */
export function matrixPostgresAdapter(pool: Pool): Adapter {
  return {
    ...PostgresAdapter(pool),
    async getUser(id) {
      return (await pool.query<AdapterUser>("SELECT * FROM public.users WHERE id = $1", [id])).rows[0] ?? null;
    },
    async updateUser(user) {
      const result = await pool.query<AdapterUser>(`UPDATE public.users SET
        name = CASE WHEN $2 THEN $3 ELSE name END,
        email = CASE WHEN $4 THEN $5 ELSE email END,
        "emailVerified" = CASE WHEN $6 THEN $7 ELSE "emailVerified" END,
        image = CASE WHEN $8 THEN $9 ELSE image END
        WHERE id = $1 RETURNING *`, [user.id,
        user.name !== undefined, user.name ?? null, user.email !== undefined, user.email ?? null,
        user.emailVerified !== undefined, user.emailVerified ?? null, user.image !== undefined, user.image ?? null]);
      if (!result.rows[0]) throw new Error("Authentication user unavailable.");
      return result.rows[0];
    },
    async getSessionAndUser(sessionToken) {
      const row = (await pool.query<{ sessionToken: string; userId: string; expires: Date; id: string; name: string | null; email: string; emailVerified: Date | null; image: string | null }>(
        `SELECT s."sessionToken", s."userId", s.expires, u.id, u.name, u.email, u."emailVerified", u.image
         FROM public.sessions s JOIN public.users u ON u.id = s."userId"
         WHERE s."sessionToken" = $1 AND s.expires > CURRENT_TIMESTAMP`, [sessionToken])).rows[0];
      if (!row) return null;
      return {
        session: { sessionToken: row.sessionToken, userId: row.userId, expires: row.expires },
        user: { id: row.id, name: row.name, email: row.email, emailVerified: row.emailVerified, image: row.image },
      };
    },
    async updateSession(session) {
      return (await pool.query<AdapterSession>(`UPDATE public.sessions SET expires = COALESCE($2, expires)
        WHERE "sessionToken" = $1 AND expires > CURRENT_TIMESTAMP RETURNING "sessionToken", "userId", expires`,
        [session.sessionToken, session.expires ?? null])).rows[0] ?? null;
    },
    async useVerificationToken({ identifier, token }) {
      // Consume even expired tokens, and never make a consumed token usable twice.
      return (await pool.query<VerificationToken>(`WITH consumed AS (
        DELETE FROM public.verification_token WHERE identifier = $1 AND token = $2 RETURNING identifier, token, expires
        ) SELECT * FROM consumed WHERE expires > CURRENT_TIMESTAMP`, [identifier, token])).rows[0] ?? null;
    },
    async deleteUser(id) {
      // FK cascades remove sessions/accounts atomically; application ledger is retained.
      await pool.query("DELETE FROM public.users WHERE id = $1", [id]);
    },
  };
}
