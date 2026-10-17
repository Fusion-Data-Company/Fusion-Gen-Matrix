"use client";
import {useState,useEffect,useRef,useCallback,useMemo} from "react";
import Image from "next/image";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useVirtualizer,defaultRangeExtractor} from "@tanstack/react-virtual";
import {Download,Copy,Video,Globe,Trash2,FolderPlus,RefreshCw,Square,Music2,LoaderCircle,AlertTriangle,ShieldAlert,Flag,ArrowUpRight,LockKeyhole,ChevronLeft,ChevronRight,Clock3,FileBox} from "lucide-react";
import type {GenerationView,Project} from "@/lib/types";
import {api,post,messageOf,isActive,formatDate} from "@/lib/client/api";
import {useDock} from "@/lib/client/dock";
import {justifiedRows} from "@/lib/client/gallery-layout";
import {useStudio} from "./studio-context";
import {Modal,ErrorNotice,StatusBadge} from "./ui";
export function OutputMedia({generation,detail=false,outputIndex=0}:{generation:GenerationView;detail?:boolean;outputIndex?:number}) {
 const output=generation.outputs[outputIndex];const {data}=useStudio();
 if(!generation.isPublic&&data?.user?.id!==generation.userId&&data?.user?.role==="admin")return <div className="state-tile"><LockKeyhole size={26}/><small>Private output · owner access required</small></div>;
 if(!output)return <RunState generation={generation}/>;
 if(output.kind==="artifact")return <div className="state-tile"><FileBox size={36}/><strong>{output.name??"Downloadable file"}</strong><small>Open details to download this result.</small></div>;
 return <>{output.kind==="image"?<Image src={output.url} alt={generation.prompt||"Generated image"} fill unoptimized sizes={detail?"(max-width: 760px) 90vw, 650px":"(max-width: 760px) 45vw, 340px"}/>:output.kind==="video"?<video controls={detail} playsInline preload="metadata" src={output.url} aria-label={generation.prompt||"Generated video"}/>:<div className="audio-tile"><Music2 size={40}/><audio controls src={output.url} preload="metadata"/></div>}{data?.mode==="demo"&&<span className="media-label">PREVIEW FIXTURE</span>}</>;
}
function RunState({generation}:{generation:GenerationView}){
 const active=isActive(generation.status),[now,setNow]=useState(()=>Date.now());
 useEffect(()=>{if(!active)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[active]);
 const seconds=Math.max(0,Math.floor((now-Date.parse(generation.createdAt))/1000));
 const labels={pending_submit:"Confirming submission",queued:"In the queue",in_progress:"Creating your result",failed:"Generation failed",nsfw:"Content filtered",canceled:"Generation canceled",completed:"Output unavailable"};
 return <div className={"run-state "+(active?"active":"")}><span aria-hidden="true">{active?<LoaderCircle size={24} className="spin"/>:generation.status==="nsfw"?<ShieldAlert size={25}/>:generation.status==="canceled"?<Square size={24}/>:<AlertTriangle size={24}/>}</span><strong>{labels[generation.status]}</strong>{active?<><small>{generation.status==="pending_submit"?"Checking provider acceptance. Your request keeps the same identity.":generation.status==="queued"?"Your request is saved. You can cancel before rendering starts.":"Your work is processing. It will appear here when saved."}</small><span className="elapsed mono"><Clock3 size={11} style={{display:"inline",marginRight:5}}/>{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,"0")} elapsed</span></>:<small>{generation.error||"Open details to reuse the prompt or review this result."}</small>}<StatusBadge status={generation.status}/></div>;
}
export function GenerationGallery({items,onChange,dense=false,selection,onSelect,publicView=false,list=false}:{items:GenerationView[];onChange:()=>Promise<void>|void;dense?:boolean;selection?:Set<string>;onSelect?:(id:string)=>void;publicView?:boolean;list?:boolean}) {
 const {data}=useStudio();const router=useRouter(),updateDraft=useDock(state=>state.update);
 const [detailId,setDetail]=useState<string|null>(null);
 const detail=items.find(item=>item.id===detailId)??null;const detailIndex=items.findIndex(item=>item.id===detailId);
 function reuse(item:GenerationView){updateDraft(item.surface,{modelId:item.modelId,prompt:item.prompt,settings:item.settings,media:data?.user?.id===item.userId?item.media:[],presetId:undefined});router.push("/"+item.surface);}
 const card=(item:GenerationView,width:number,height:number)=><article style={{width,flexShrink:0}} className={"media-card "+(selection?.has(item.id)?"selected":"")} key={item.id}>{onSelect&&<input className="media-select" type="checkbox" aria-label={"Select generation "+item.prompt.slice(0,40)} checked={selection?.has(item.id)??false} onChange={()=>onSelect(item.id)}/>}<div className="media-frame" style={{height,aspectRatio:"auto"}} tabIndex={0} role="button" aria-label={"Open generation "+(item.prompt||item.id)} onClick={e=>{if(!(e.target instanceof HTMLElement)||!e.target.closest("audio,video[controls]"))setDetail(item.id);}} onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==="Enter"||e.key===" "){e.preventDefault();setDetail(item.id);}}}><OutputMedia generation={item}/></div><div className="media-info"><p>{item.prompt||"Reference-based generation"}</p><div className="media-meta"><span className="mono">{formatDate(item.createdAt)}</span><StatusBadge status={item.status}/></div></div><div className="media-actions">{item.outputs[0]&&(item.isPublic||data?.user?.id===item.userId)&&<a className="icon-button" href={item.outputs[0].url} download title="Download output" aria-label="Download output"><Download size={15}/></a>}<button className="icon-button" title="Reuse prompt and settings" aria-label="Reuse prompt and settings" onClick={()=>reuse(item)}><Copy size={15}/></button><button className="icon-button" title="View prompt and actions" aria-label="View prompt and actions" onClick={()=>setDetail(item.id)}><ArrowUpRight size={15}/></button></div></article>;
 return <>{<JustifiedGallery items={items} render={card} dense={dense} list={list}/>}<Modal open={!!detail} onClose={()=>setDetail(null)} title="Generation details" wide>{detail&&<div className="detail-navigation"><span>{detailIndex+1} of {items.length}</span><div><button className="button compact" aria-label="Previous generation" disabled={detailIndex<=0} onClick={()=>setDetail(items[detailIndex-1].id)}><ChevronLeft size={15}/>Previous</button><button className="button compact" aria-label="Next generation" disabled={detailIndex>=items.length-1} onClick={()=>setDetail(items[detailIndex+1].id)}>Next<ChevronRight size={15}/></button></div></div>}{detail&&<GenerationDetail key={detail.id} generation={detail} publicView={publicView} onChange={async()=>{await onChange();}} onDelete={()=>setDetail(null)}/>}</Modal></>;
}
function JustifiedGallery({items,render,dense,list}:{items:GenerationView[];render:(item:GenerationView,width:number,height:number)=>React.ReactNode;dense:boolean;list:boolean}) {
 "use no memo";
 const parent=useRef<HTMLDivElement>(null),visited=useRef(new Set<string>());
 const [width,setWidth]=useState(0);
 const virtual=items.length>60;
 useEffect(()=>{
  const target=parent.current;if(!target)return;
  const observer=new ResizeObserver(entries=>setWidth(Math.floor(entries[0]?.contentRect.width??0)));
  observer.observe(target);return()=>observer.disconnect();
 },[]);
 const rows=useMemo(()=>list?items.map(item=>({key:item.id,height:120,gap:12,tiles:[{item,width}]})):justifiedRows(items,width,dense),[items,width,dense,list]);
 // Retain visited media through fast scrolling, including when status updates regroup a row.
 const rangeExtractor=useCallback((range:Parameters<typeof defaultRangeExtractor>[0])=>{
  defaultRangeExtractor(range).forEach(index=>rows[index]?.tiles.forEach(tile=>visited.current.add(tile.item.id)));
  return rows.flatMap((row,index)=>row.tiles.some(tile=>visited.current.has(tile.item.id))?[index]:[]);
 },[rows]);
 const getItemKey=useCallback((index:number)=>rows[index].key,[rows]);
 // TanStack Virtual uses imperative measurements and intentionally stays outside React Compiler memoization.
 // eslint-disable-next-line react-hooks/incompatible-library
 const virtualizer=useVirtualizer({count:rows.length,getScrollElement:()=>parent.current,estimateSize:index=>rows[index].height+(list?14:140),overscan:3,rangeExtractor,getItemKey,enabled:virtual&&width>0});
 // Cards remain flat, keyed siblings: regrouping rows must not remount focused media.
 const measurements=virtualizer.getVirtualItems();
 const visibleRows=new Set(virtual?measurements.map(item=>item.index):rows.map((_,index)=>index));
 const tiles=rows.flatMap((row,index)=>{
  if(!visibleRows.has(index))return [];
  let left=0;
  return row.tiles.map(tile=>{const position={...tile,row:index,height:row.height,gap:row.gap,left};left+=tile.width+row.gap;return position;});
 });
 return <div className={"justified-gallery"+(virtual?" virtual-gallery":"")+(list?" generation-list":"")} ref={parent} role="region" tabIndex={virtual?0:undefined} aria-label="Generation gallery" aria-busy={width===0}>
  <div className="justified-content" style={{gridTemplateRows:rows.map((row,index)=>visibleRows.has(index)?"auto":(row.height+(list?14:140))+"px").join(" ")}}>
   {virtual&&measurements.map(measurement=><div key={rows[measurement.index].key} data-index={measurement.index} ref={virtualizer.measureElement} aria-hidden="true" className="justified-measure" style={{gridRow:measurement.index+1}}/>)}
   {tiles.map(tile=><div key={tile.item.id} className="justified-tile" style={{gridRow:tile.row+1,width:tile.width,marginLeft:tile.left,paddingBottom:tile.gap}}>{render(tile.item,tile.width,tile.height)}</div>)}
  </div>
 </div>;
}
export function GenerationDetail({generation,onChange,onDelete,publicView=false}:{generation:GenerationView;onChange:()=>Promise<void>|void;onDelete?:()=>void;publicView?:boolean}) {
 const {data,requireLogin,notice,reload}=useStudio();const router=useRouter();const updateDraft=useDock(state=>state.update);
 const [busy,setBusy]=useState(""),[error,setError]=useState(""),[confirm,setConfirm]=useState(false),[move,setMove]=useState(false),[projects,setProjects]=useState<Project[]>([]),[projectId,setProjectId]=useState(generation.projectId??""),[report,setReport]=useState(false),[reason,setReason]=useState("");
 const [outputIndex,setOutputIndex]=useState(0);
 const selectedOutputIndex=Math.min(outputIndex,Math.max(0,generation.outputs.length-1));
 const selectedOutput=generation.outputs[selectedOutputIndex];
 const owned=data?.user?.id===generation.userId&&!publicView;const model=data?.models.find(item=>item.id===generation.modelId);
 async function action(actionName:string) {setBusy(actionName);setError("");try{await post("/api/generations/"+generation.id,{action:actionName,...(actionName==="move"?{projectId:projectId||undefined}:{})});await onChange();await reload();if(actionName==="delete")onDelete?.();if(actionName==="move")setMove(false);notice(actionName==="publish"?"Published to Community. Your prompt is now public.":actionName==="unpublish"?"Removed from Community.":actionName==="cancel"?"Cancellation requested.":actionName==="delete"?"Generation deleted.":actionName==="move"?"Project updated.":"Status refreshed.");}catch(e){setError(messageOf(e));}finally{setBusy("");setConfirm(false);}}
 function reuse() {updateDraft(generation.surface,{modelId:generation.modelId,prompt:generation.prompt,settings:generation.settings,media:owned?generation.media:[],presetId:undefined});router.push("/"+generation.surface);onDelete?.();}
 function animate() {const model=data?.models.find(item=>item.surface==="video"&&item.roles.some(role=>role.kind==="image"&&(role.role==="start"||role.role==="reference")));if(!model){notice("No verified image-to-video model is available.");return;}const role=model.roles.find(role=>role.kind==="image")?.role;if(!role)return;const output=selectedOutput;if(output?.kind!=="image")return;updateDraft("video",{modelId:model.id,prompt:generation.prompt,settings:Object.fromEntries(model.settings.map(setting=>[setting.key,setting.default])),media:[{id:generation.id,outputIndex:selectedOutputIndex,url:output.url,kind:"image",role}],presetId:undefined});router.push("/video");onDelete?.();}
 async function openMove() {setProjectId(generation.projectId??"");setError("");setMove(true);try{setProjects((await api<{items:Project[]}>("/api/projects")).items);}catch(e){setError(messageOf(e));}}
 return <><div className="detail-layout"><div className="detail-preview"><div className="detail-media"><OutputMedia generation={generation} detail outputIndex={selectedOutputIndex}/></div>{generation.outputs.length>1&&<div className="row wrap" role="group" aria-label="Result outputs">{generation.outputs.map((output,index)=><button key={output.url} className={"button compact"+(index===selectedOutputIndex?" primary":"")} aria-pressed={index===selectedOutputIndex} onClick={()=>setOutputIndex(index)}>Output {index+1}</button>)}</div>}</div><div className="detail-metadata"><div className="row"><StatusBadge status={generation.status}/>{generation.isPublic&&<span className="tag"><Globe size={11}/>Public</span>}</div><div><h3>Prompt</h3><p className="prompt-copy">{generation.prompt||"No text prompt"}</p><button className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText(generation.prompt);notice("Prompt copied.");}catch{notice("Clipboard is unavailable in this browser.");}}}><Copy size={12} style={{display:"inline",marginRight:5}}/>Copy prompt</button></div><dl className="detail-properties"><div><dt>Model</dt><dd>{model?.label??generation.modelId}</dd></div><div><dt>Created</dt><dd>{formatDate(generation.createdAt)}</dd></div>{generation.cost!==undefined&&<div><dt>Generation cost</dt><dd>{generation.cost} {data?.mode==="demo"?"preview ":""}credits</dd></div>}<div><dt>Media</dt><dd className="capitalize">{generation.surface}</dd></div>{Object.entries(generation.settings).map(([key,value])=><div key={key}><dt>{key.replaceAll("_"," ")}</dt><dd>{String(value)}</dd></div>)}</dl>{generation.retentionError&&<ErrorNotice message={"Storage pending: "+generation.retentionError}/>}
 <div className="detail-actions"><button className="button compact" onClick={reuse}><Copy size={14}/>{owned?"Reuse":"Recreate"}</button>{(generation.isPublic||owned?generation.outputs:[]).map((output,index)=><a className="button compact" key={output.url} href={output.url} download><Download size={14}/>Download{generation.outputs.length>1?" "+(index+1):""}{output.kind==="artifact"?" · "+(output.name??"file"):""}</a>)}{owned&&selectedOutput?.kind==="image"&&generation.status==="completed"&&<button className="button compact" onClick={animate}><Video size={14}/>Animate</button>}{owned&&isActive(generation.status)&&<button className="button compact" disabled={!!busy} onClick={()=>void action("refresh")}><RefreshCw size={14}/>Refresh status</button>}{owned&&generation.status==="queued"&&<button className="button compact" disabled={!!busy} onClick={()=>void action("cancel")}><Square size={14}/>Cancel</button>}{owned&&generation.status==="completed"&&<button className="button compact" disabled={!!busy} onClick={()=>void action(generation.isPublic?"unpublish":"publish")}><Globe size={14}/>{generation.isPublic?"Unpublish":"Publish"}</button>}{owned&&<button className="button compact" onClick={()=>void openMove()}><FolderPlus size={14}/>Project</button>}{owned&&!isActive(generation.status)&&<button className="button compact danger" onClick={()=>setConfirm(true)}><Trash2 size={14}/>Delete</button>}{!owned&&generation.isPublic&&<button className="button compact" onClick={()=>{if(requireLogin())setReport(true);}}><Flag size={14}/>Report</button>}</div>
 {generation.isPublic&&<Link href={"/g/"+generation.id} className="small muted">Open public detail <ArrowUpRight size={12} style={{display:"inline"}}/></Link>}{error&&<ErrorNotice message={error}/>}</div></div>
 <Modal open={confirm} onClose={()=>setConfirm(false)} title="Delete this generation?" description="The generation and its stored outputs will be removed. This cannot be undone."><div className="row"><button className="button" onClick={()=>setConfirm(false)}>Keep generation</button><button className="button danger" disabled={!!busy} onClick={()=>void action("delete")}>Delete generation</button></div></Modal>
 <Modal open={move} onClose={()=>setMove(false)} title="Move to a project"><div className="stack"><label className="field">Project<select value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">No project</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label><button className="button primary" disabled={!!busy} onClick={()=>void action("move")}>Save project</button></div></Modal>
 <Modal open={report} onClose={()=>setReport(false)} title="Report this generation" description="Your report is sent to the studio administrator."><form className="stack" onSubmit={async e=>{e.preventDefault();setBusy("report");setError("");try{await post("/api/reports",{generationId:generation.id,reason});setReport(false);notice("Report submitted for review.");}catch(err){setError(messageOf(err));}finally{setBusy("");}}}><label className="field">Reason<textarea value={reason} onChange={e=>setReason(e.target.value)} minLength={5} maxLength={1000} required/></label>{error&&<ErrorNotice message={error}/>}<button className="button" disabled={!!busy}>Submit report</button></form></Modal>
 </>;
}
