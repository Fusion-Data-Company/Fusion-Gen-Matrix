import {repository} from "../db/repository";
import {starterPresets} from "./presets";
export async function ensureStudio(){
 await repository().transaction(async tx=>{
  for(const preset of starterPresets)if(!await tx.get("presets",preset.id))await tx.insert("presets",preset);
 });
}
