import {describe,it,expect} from "vitest";
import {galleryAspectRatio,justifiedRows} from "../lib/client/gallery-layout";
import type {GenerationView} from "../lib/types";

function item(id:string,width?:number,height?:number,settings:GenerationView["settings"]={}):GenerationView {
 return {id,userId:"owner",surface:"image",modelId:"fixture",prompt:id,settings,media:[],status:"completed",isPublic:false,
  outputs:[{kind:"image",url:"/fixture.png",r2Key:"fixture",contentType:"image/png",width,height}],createdAt:"2026-10-17T00:00:00Z",updatedAt:"2026-10-17T00:00:00Z"};
}
describe("justified gallery geometry",()=>{
 it("prefers retained dimensions, with a requested-ratio fallback for queued work",()=>{
  expect(galleryAspectRatio(item("portrait",900,1600,{aspect_ratio:"1:1"}))).toBe(9/16);
  expect(galleryAspectRatio({...item("queued",undefined,undefined,{aspect_ratio:"3:2"}),outputs:[]})).toBe(1.5);
  expect(galleryAspectRatio({...item("video"),surface:"video",outputs:[]})).toBe(16/9);
 });
 it("keeps malformed dimensions and unknown ratios finite",()=>{
  for(const dimensions of [[NaN,1],[Infinity,1],[1,0],[-2,1],[0,0]])expect(galleryAspectRatio(item("bad",...dimensions))).toBe(1);
  expect(galleryAspectRatio(item("bad",undefined,undefined,{aspect_ratio:"auto"}))).toBe(1);
  expect(galleryAspectRatio(item("wide",1000000,1))).toBe(8);
 });
 it("handles empty, hidden and invalid containers without creating invalid rows",()=>{
  expect(justifiedRows([],900)).toEqual([]);
  for(const width of [0,1,2,-1,NaN,Infinity])expect(justifiedRows([item("one")],width)).toEqual([]);
 });
 it("fills complete rows, preserves aspect ratios and order, and never overflows",()=>{
  const sizes=[[900,1600],[1600,900],[1024,1024],[2400,1000],[800,1200]];
  const fixtures=Array.from({length:500},(_,i)=>item(String(i),...sizes[i%sizes.length]));
  for(const width of [3,320,390,548,760,1200,1440])for(const dense of [false,true]){
   const rows=justifiedRows(fixtures,width,dense);
   expect(rows.flatMap(row=>row.tiles.map(tile=>tile.item.id))).toEqual(fixtures.map(value=>value.id));
   expect(new Set(rows.map(row=>row.key)).size).toBe(rows.length);
   rows.forEach((row,index)=>{
    const used=row.tiles.reduce((sum,tile)=>sum+tile.width,0)+row.gap*(row.tiles.length-1);
    expect(used).toBeLessThanOrEqual(width+0.00001);
    if(index<rows.length-1)expect(used).toBeCloseTo(width,7);
    for(const tile of row.tiles){
     expect(tile.width).toBeGreaterThan(0);expect(row.height).toBeGreaterThan(0);
     expect((tile.width-2)/row.height).toBeCloseTo(galleryAspectRatio(tile.item),7);
    }
   });
  }
 });
 it("does not enlarge a sparse final row to the entire container",()=>{
  const [row]=justifiedRows([item("one",1000,1000)],1200);
  expect(row.height).toBe(220);expect(row.tiles[0].width).toBe(222);
 });
 it("makes the dense option more compact without changing source order",()=>{
  const fixtures=Array.from({length:20},(_,i)=>item(String(i),1000,1000));
  const comfortable=justifiedRows(fixtures,1100),dense=justifiedRows(fixtures,1100,true);
  expect(dense.length).toBeLessThan(comfortable.length);
  expect(dense[0].height).toBeLessThan(comfortable[0].height);
 });
});
