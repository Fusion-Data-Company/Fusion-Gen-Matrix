import type {GenerationView} from "@/lib/types";
export type HistoryFilter="all"|"active"|"completed"|"failed"|"nsfw"|"canceled";
export function filterHistory<T extends Pick<GenerationView,"prompt"|"modelId"|"status">>(items:readonly T[],filter:HistoryFilter,search:string):T[]{
 const term=search.trim().toLocaleLowerCase();
 return items.filter(item=>(filter==="all"||(filter==="active"?["pending_submit","queued","in_progress"].includes(item.status):item.status===filter))&&(!term||(item.prompt+" "+item.modelId).toLocaleLowerCase().includes(term)));
}
