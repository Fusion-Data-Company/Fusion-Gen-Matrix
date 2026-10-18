import {timingSafeEqual} from "node:crypto";
import {api} from "@/lib/http";
import {getEnv} from "@/lib/env";
import {AppError} from "@/lib/errors";
import {postgresPool} from "@/lib/db/postgres";
import {cleanupPostgresExpired} from "@/lib/db/postgres-maintenance";
import {reconcile} from "@/lib/generations/service";
import {reconcileBilling,retryCreditReceipts,retryStripeEvents} from "@/lib/billing/stripe";
export const maxDuration=60;
export async function GET(request:Request){return api(async()=>{
 if(getEnv().APP_MODE!=="live")throw new AppError("CRON_DISABLED","Live reconciliation is disabled in preview.",503);
 const actual=Buffer.from(request.headers.get("authorization")??""),expected=Buffer.from("Bearer "+process.env.CRON_SECRET);
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw new AppError("UNAUTHORIZED","Invalid reconciliation authorization.",401);
 if(getEnv().DATABASE_PROVIDER==="postgres")await cleanupPostgresExpired(postgresPool());
 const generations=await reconcile(8);await retryStripeEvents(5);await reconcileBilling();await retryCreditReceipts(5);return {ok:true,...generations};
});}
