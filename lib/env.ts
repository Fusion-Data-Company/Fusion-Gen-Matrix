import "server-only";
import {z} from "zod";
const base=z.object({
 APP_MODE:z.enum(["demo","live","showcase"]).default(process.env.VERCEL?"showcase":"demo"),
 APP_URL:z.url().default("http://127.0.0.1:3210"),
 DATABASE_PROVIDER:z.enum(["mongodb","postgres"]).default("postgres"),
 MEDIA_STORAGE_PROVIDER:z.enum(["r2","vercel-blob"]).default("vercel-blob"),
 DATA_DIR:z.string().transform(v=>v||process.cwd()+"/.data").default(process.cwd()+"/.data"),
 MONGODB_DB:z.string().regex(/^[a-zA-Z0-9_-]+$/).default("fusion_gen_matrix"),
 CREDIT_MARKUP:z.coerce.number().min(1).max(20).default(2),
 CREDIT_USD_VALUE:z.coerce.number().positive().default(0.01),
 SIGNUP_BONUS_CREDITS:z.coerce.number().int().min(0).max(10000).default(0),
 HF_API_BASE_URL:z.url().default("https://api.higgsfield.ai"),
 HF_WEBHOOK_BASE_URL:z.string().default(""),
 MAX_GENERATION_USD:z.coerce.number().positive().max(100).default(5),
 ENABLE_LIVE_BILLING:z.enum(["true","false"]).default("false")
});
export function getEnv() {
 const result=base.safeParse(process.env);
 if(!result.success) throw new Error("Invalid app configuration: "+result.error.issues.map(x=>x.path.join(".")).join(", "));
 const e=result.data;
 if(e.APP_MODE==="demo" && process.env.NODE_ENV==="production" && process.env.ALLOW_LOCAL_PREVIEW!=="true") throw new Error("Local preview is disabled in production. Configure APP_MODE=live or explicitly run a loopback-only ALLOW_LOCAL_PREVIEW=true preview.");
 if(e.APP_MODE==="live"){
  const required=["AUTH_SECRET","AUTH_RESEND_KEY","EMAIL_FROM","HF_CREDENTIALS","HF_WEBHOOK_SECRET","CRON_SECRET"];
  required.push(e.DATABASE_PROVIDER==="postgres"?"DATABASE_URL":"MONGODB_URI");
  if(e.MEDIA_STORAGE_PROVIDER==="r2")required.push("R2_ACCOUNT_ID","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY","R2_BUCKET");
  const missing=required.filter(k=>!process.env[k]?.trim());
  if(e.MEDIA_STORAGE_PROVIDER==="vercel-blob"&&!blobStorageConfigured())missing.push("BLOB_READ_WRITE_TOKEN or BLOB_STORE_ID with VERCEL_OIDC_TOKEN");
  if(missing.length)throw new Error("Missing live configuration: "+missing.join(", "));
  for(const key of ["AUTH_SECRET","HF_WEBHOOK_SECRET","CRON_SECRET"])if((process.env[key]??"").length<32)throw new Error(key+" must contain at least 32 characters");
  if(!e.APP_URL.startsWith("https://"))throw new Error("Live APP_URL must use HTTPS");
 }
 return e;
}
function blobStorageConfigured(){return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim()||(process.env.BLOB_STORE_ID?.trim()&&process.env.VERCEL_OIDC_TOKEN?.trim()));}
export function isDemo(){return getEnv().APP_MODE==="demo";}
export function capabilityStatus(){const e=getEnv();return {generation:e.APP_MODE==="live"&&Boolean(process.env.HF_CREDENTIALS),auth:e.APP_MODE==="live"&&Boolean(process.env.AUTH_RESEND_KEY),storage:e.APP_MODE==="live"&&(e.MEDIA_STORAGE_PROVIDER==="vercel-blob"?blobStorageConfigured():Boolean(process.env.R2_BUCKET)),billing:e.APP_MODE==="live"&&Boolean(process.env.STRIPE_SECRET_KEY)&&Boolean(process.env.STRIPE_PRICE_STARTER_MONTHLY)&&process.env.BILLING_PRICES_CONFIRMED==="true"};}
