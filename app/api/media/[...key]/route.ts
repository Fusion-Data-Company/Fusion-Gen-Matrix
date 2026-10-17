import {artifactDisposition} from "@/lib/storage/artifacts";
import {getEnv} from "@/lib/env";
import {api} from "@/lib/http";
import {currentUser} from "@/lib/auth/server";
import {repository} from "@/lib/db/repository";
import {readMedia} from "@/lib/storage";
import {notFound} from "@/lib/errors";
type Context={params:Promise<{key:string[]}>};
export async function GET(request:Request,context:Context){return api(async()=>{
 if(getEnv().APP_MODE==="showcase")notFound();
 const key=(await context.params).key.join("/"),user=await currentUser(request);
 const allowed=await repository().read(async tx=>{
  const parts=key.split("/");if(parts[0]!=="u"||parts.length<4)return false;
  const owner=parts[1];
  if(parts[2]==="generations"){
   const g=await tx.get("generations",parts[3]);
   return Boolean(g&&!g.deletedAt&&g.userId===owner&&g.status==="completed"&&(user?.id===owner||g.isPublic)&&g.outputs.some(o=>o.r2Key===key));
  }
  if(parts[2]==="uploads"&&user?.id===owner){const matches=await tx.find("uploads",{userId:owner,r2Key:key},1);return Boolean(matches[0]&&matches[0].status!=="pending");}
  return false;
 });
 if(!allowed)notFound();
 const media=await readMedia(key,request.headers.get("range")??undefined);
 const headers:Record<string,string>={"Content-Type":media.contentType,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Accept-Ranges":"bytes","Content-Security-Policy":"default-src 'none'; sandbox","Content-Disposition":artifactDisposition(key)};
 if(media.contentLength!==undefined)headers["Content-Length"]=String(media.contentLength);
 if(media.contentRange)headers["Content-Range"]=media.contentRange;
 return new Response(media.body as BodyInit,{status:media.status,headers});
});}
