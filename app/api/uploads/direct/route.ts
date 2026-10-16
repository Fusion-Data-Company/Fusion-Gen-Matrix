import { api } from "@/lib/http";
import { requireUser } from "@/lib/auth/server";
import { assertSameOrigin, rateLimit } from "@/lib/auth/security";
import { repository } from "@/lib/db/repository";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { publicUpload } from "@/lib/serialize";
import { prepareDirectUpload, completeDirectUpload } from "@/lib/storage";
import { readDirectUploadRequest } from "@/lib/storage/direct-contract";
import { DirectUploadCoordinator } from "@/lib/storage/direct";

export const runtime="nodejs";
export const maxDuration=300;
export async function POST(request:Request){
 return api(async()=>{
  assertSameOrigin(request);
  if(getEnv().APP_MODE!=="live")throw new AppError("DIRECT_UPLOAD_UNAVAILABLE","Direct upload is available only when the live services are configured.",503);
  const user=await requireUser(request);
  const input=await readDirectUploadRequest(request);
  await rateLimit("direct-upload-"+input.stage,user.id,input.stage==="prepare"?20:40,60);
  const service=new DirectUploadCoordinator(repository(),{prepareDirectUpload,completeDirectUpload});
  if(input.stage==="prepare")return service.prepare(user.id,input);
  return {upload:publicUpload(await service.complete(user.id,input.uploadId))};
 });
}
