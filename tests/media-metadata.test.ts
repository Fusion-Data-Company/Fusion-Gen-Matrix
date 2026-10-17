import {describe,it,expect} from "vitest";
import {readFile} from "node:fs/promises";
import {inspectMedia} from "../lib/storage/metadata";
import {inspectArtifact,artifactDisposition} from "../lib/storage/artifacts";
import {MediaService,type MediaStore} from "../lib/storage";
import type {Generation} from "../lib/types";
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=","base64");
describe("measured media metadata",()=>{
 it("reads actual image dimensions and rejects corrupt files",async()=>{
  await expect(inspectMedia(png,"image")).resolves.toEqual({width:1,height:1});
  await expect(inspectMedia(Buffer.from("broken"),"image")).rejects.toThrow("dimensions or duration");
 });
 it("reads a real MP4 fixture without browser codecs or provider metadata",async()=>{
  const metadata=await inspectMedia(await readFile(new URL("../public/fixtures/demo-motion.mp4",import.meta.url)),"video");
  expect(metadata.width).toBeGreaterThan(0);expect(metadata.height).toBeGreaterThan(0);expect(metadata.durationSec).toBeGreaterThan(0);
 });
 it("rejects a container signature with no actual track",async()=>{
  const file=Buffer.alloc(24);file.writeUInt32BE(24,0);file.write("ftypisom",4);
  await expect(inspectMedia(file,"video")).rejects.toThrow("dimensions or duration");
 });
 it("carries measured metadata through private uploads and provider retention",async()=>{
  const saved=new Map<string,Uint8Array>(),store:MediaStore={put:async(key,bytes)=>{saved.set(key,bytes);},read:async()=>({body:png,contentType:"image/png",status:200}),remove:async()=>{}};
  const service=new MediaService({mode:"live",store,newId:()=>"upload1",transfer:async()=>({bytes:png,contentType:"image/png",status:200})});
  const upload=await service.saveUpload("user1",new File([png],"image.png",{type:"image/png"}));expect(upload).toMatchObject({width:1,height:1});
  const outputs=await service.retainOutputs({id:"g1",userId:"user1"} as Generation,[{kind:"image",url:"https://example.com/output",width:9000,height:9000}]);
  expect(outputs[0]).toMatchObject({width:1,height:1});expect(saved.size).toBe(2);
 });
});
describe("opaque provider files",()=>{
 it("retains supported provider formats as attachment-only downloads",()=>{
  const files={zip:Buffer.from([80,75,5,6,...Array(18).fill(0)]),jsx:Buffer.from("// composition\nvar composition = app.project.items;"),fbx:Buffer.from("; FBX 7.4.0 project file\n"),ply:Buffer.from("ply\nformat ascii 1.0\nend_header\n")};
  for(const [name,bytes] of Object.entries(files)){expect(inspectArtifact(bytes,name).extension).toBe(name);expect(artifactDisposition(`u/a/generations/g/0.${name}`)).toContain("attachment;");}
  expect(artifactDisposition("u/a/generations/g/0.png")).toBe("inline");
 });
 it("rejects HTML errors, wrong signatures, empty files, and unsupported formats",()=>{
  for(const [bytes,name] of [[Buffer.from("<html>error</html>"),"jsx"],[png,"zip"],[Buffer.alloc(0),"ply"],[png,"exe"]] as const)expect(()=>inspectArtifact(bytes,name)).toThrow();
 });
 it("keeps artifacts private and never marks an invalid mixed result as completed",async()=>{
  const files=new Map<string,Uint8Array>(),zip=Buffer.from([80,75,5,6,...Array(18).fill(0)]),store:MediaStore={put:async(key,bytes)=>{files.set(key,bytes);},read:async()=>({body:zip,contentType:"application/zip",status:200}),remove:async()=>{}};
  const service=new MediaService({mode:"live",store,transfer:async()=>({bytes:zip,contentType:"application/octet-stream",status:200})});
  const outputs=await service.retainOutputs({id:"g1",userId:"user1"} as Generation,[{kind:"artifact",name:"zip",url:"https://example.com/output"}]);
  expect(outputs[0]).toMatchObject({kind:"artifact",r2Key:"u/user1/generations/g1/0.zip",contentType:"application/zip"});expect(files.size).toBe(1);
  await expect(service.retainOutputs({id:"g1",userId:"user1"} as Generation,[{kind:"artifact",name:"ply",url:"https://example.com/output"}])).rejects.toThrow("declared format");
 });
});
