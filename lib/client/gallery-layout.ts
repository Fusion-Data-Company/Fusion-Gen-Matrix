import type {GenerationView} from "@/lib/types";

type GallerySource = Pick<GenerationView, "id" | "surface" | "outputs" | "settings">;
export interface GalleryTile<T> {item:T;width:number}
export interface GalleryRow<T> {key:string;height:number;gap:number;tiles:GalleryTile<T>[]}

function validRatio(width:unknown,height:unknown):number|undefined {
 if(typeof width!=="number"||typeof height!=="number"||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)return;
 const ratio=width/height;
 // Bound corrupt metadata, while retaining ordinary portrait, landscape and panoramic formats.
 return Number.isFinite(ratio)?Math.max(1/8,Math.min(8,ratio)):undefined;
}
export function galleryAspectRatio(item:GallerySource):number {
 const output=item.outputs[0];
 const measured=validRatio(output?.width,output?.height);
 if(measured!==undefined)return measured;
 const requested=String(item.settings.aspect_ratio??"").match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
 if(requested){const ratio=validRatio(Number(requested[1]),Number(requested[2]));if(ratio!==undefined)return ratio;}
 return item.surface==="video"?16/9:1;
}

/** Original row packing: nearest target height, stable input order, unstretched last row. */
export function justifiedRows<T extends GallerySource>(items:readonly T[],width:number,dense=false):GalleryRow<T>[] {
 if(!Number.isFinite(width)||width<=2||!items.length)return [];
 const gap=width<550||dense?10:14;
 const target=Math.min(dense?150:220,width-2);
 const minTile=Math.min(width,dense?100:130);
 const maxColumns=Math.max(1,Math.floor((width+gap)/(minTile+gap)));
 const ratios=items.map(galleryAspectRatio),rows:GalleryRow<T>[]=[];
 for(let start=0;start<items.length;){
  let sum=0,bestCount=1,bestHeight=0,bestScore=Infinity;
  for(let count=1;count<=maxColumns&&start+count<=items.length;count++){
   sum+=ratios[start+count-1];
   // Each card has a one-pixel border. Include those borders in the row's width budget.
   const height=(width-gap*(count-1)-2*count)/sum;
   if(height<=0)break;
   const smallest=Math.min(...ratios.slice(start,start+count))*height+2;
   if(count>1&&smallest<minTile)break;
   const score=Math.abs(Math.log(height/target));
   if(score<bestScore){bestCount=count;bestHeight=height;bestScore=score;}
   if(height<=target)break;
  }
  const last=start+bestCount===items.length;
  const height=last?Math.min(target,bestHeight):bestHeight;
  const tiles=items.slice(start,start+bestCount).map((item,index)=>({item,width:ratios[start+index]*height+2}));
  rows.push({key:JSON.stringify(tiles.map(tile=>tile.item.id)),height,gap,tiles});
  start+=bestCount;
 }
 return rows;
}
