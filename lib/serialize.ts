import type {Generation,GenerationView,Upload} from "./types";
export function publicGeneration(g:Generation):Generation{
 const {providerMedia,webhookUrl,providerStatusUrl,providerCancelUrl,finalizingUntil,finalizingToken,...safe}=g;
 void providerMedia;void webhookUrl;void providerStatusUrl;void providerCancelUrl;void finalizingUntil;void finalizingToken;
 return safe;
}
export function publicUpload(u:Upload):Upload{const {providerUrl,...safe}=u;void providerUrl;return safe;}

export function communityGeneration(g:Generation):GenerationView{return {id:g.id,userId:g.userId,surface:g.surface,modelId:g.modelId,prompt:g.prompt,settings:g.settings,media:[],status:g.status,outputs:g.outputs,isPublic:g.isPublic,createdAt:g.createdAt,updatedAt:g.updatedAt,finishedAt:g.finishedAt,publishedAt:g.publishedAt};}
