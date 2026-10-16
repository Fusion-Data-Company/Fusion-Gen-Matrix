import {api} from "@/lib/http";
import {currentUser} from "@/lib/auth/server";
import {assertLocalPreview} from "@/lib/auth/security";
import {starterPresets} from "@/lib/studio/presets";
import {getEnv,capabilityStatus} from "@/lib/env";
import {models} from "@/lib/catalog";
import {repository} from "@/lib/db/repository";
import {plans} from "@/lib/billing/plans";
import {ensureStudio} from "@/lib/studio/state";
import {communityGeneration} from "@/lib/serialize";
export const dynamic="force-dynamic";
export async function GET(request:Request){return api(async()=>{
 if(getEnv().APP_MODE==="showcase")return {mode:"showcase",user:null,models,presets:starterPresets,plans,capabilities:{generation:false,auth:false,storage:false,billing:false},community:[]};
 if(getEnv().APP_MODE==="demo")assertLocalPreview(request);
 await ensureStudio();const user=await currentUser(request);
 const data=await repository().read(async tx=>({presets:await tx.find("presets",{active:true}),pricing:await tx.find("model_pricing"),community:await tx.find("generations",{isPublic:true,status:"completed",deletedAt:{$exists:false}},48)}));
 const disabled=new Set(data.pricing.filter(p=>!p.enabled).map(p=>p.modelId));
 return {mode:getEnv().APP_MODE,user,models:models.filter(m=>!disabled.has(m.id)),presets:data.presets,plans,capabilities:capabilityStatus(),community:data.community.map(communityGeneration)};
});}
