"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {ConceptArt,ConceptLabel} from "./concept-art";
import {useRouter} from "next/navigation";
import {Search,ArrowUpRight,Globe,Layers,ImageIcon} from "lucide-react";
import {useStudio} from "./studio-context";
import {GenerationGallery,GenerationDetail} from "./generations";
import {Spinner,PageHeading,EmptyState,ErrorNotice} from "./ui";
import {useDock} from "@/lib/client/dock";
import {api,messageOf} from "@/lib/client/api";
import type {GenerationView} from "@/lib/types";
export function EffectsPage() {
 const {data,loading}=useStudio();const [category,setCategory]=useState("All"),[search,setSearch]=useState("");
 const presets=data?.presets.filter(item=>item.active)??[];const categories=["All",...new Set(presets.map(item=>item.category))];const visible=presets.filter(item=>(category==="All"||item.category===category)&&(item.title+" "+item.description).toLowerCase().includes(search.toLowerCase()));
 if(loading)return <Spinner/>;
 return <section className="page-wrap effects-page"><PageHeading eyebrow="FUSION EFFECTS" title="FIND YOUR NEXT DIRECTION" description="Reusable creative recipes for images and motion. Add your subject and make the direction your own."/><div className="filter-bar"><div className="tabs">{categories.map(item=><button key={item} className={category===item?"active":""} onClick={()=>setCategory(item)}>{item}</button>)}</div><div className="search-field"><Search size={16}/><input placeholder="Search effects" aria-label="Search effects" value={search} onChange={e=>setSearch(e.target.value)}/></div></div><div className="section-grid">{visible.map((preset,index)=><Link className="feature-card" href={"/effects/"+preset.slug} key={preset.id}><div className="feature-art"><ConceptArt scene={index}/><ConceptLabel/></div><div className="feature-info"><div><div className="eyebrow" style={{fontSize:9,marginBottom:8}}>{preset.category} / {preset.surface}</div><h3>{preset.title}</h3><p>{preset.description}</p></div><ArrowUpRight size={18}/></div></Link>)}</div>{!visible.length&&<EmptyState icon={<Layers size={28}/>} title="No matching effects" description="Try another category or clear your search." action={<button className="button" onClick={()=>{setSearch("");setCategory("All");}}>Clear filters</button>}/>}</section>;
}
export function EffectDetailPage({slug}:{slug:string}) {
 const {data,loading}=useStudio();const preset=data?.presets.find(item=>item.slug===slug),[subject,setSubject]=useState("");const update=useDock(state=>state.update);const router=useRouter();
 if(loading)return <Spinner/>;
 if(!preset)return <section className="page-wrap"><EmptyState icon={<Layers size={27}/>} title="Effect unavailable" description="This effect may have been removed or is no longer active." action={<Link href="/effects" className="button">Browse effects</Link>}/></section>;
 const model=data?.models.find(item=>item.id===preset.modelId);
 return <section className="page-wrap"><Link href="/effects" className="small muted">← All effects</Link><div className="effect-detail" style={{marginTop:24}}><div className="effect-cover"><ConceptArt scene={Math.max(0,data?.presets.findIndex(item=>item.id===preset.id)??0)}/><ConceptLabel/></div><div className="effect-copy"><span className="tag">{preset.category}</span><h1>{preset.title}</h1><p>{preset.description}</p><div className="row wrap" style={{marginBottom:22}}><span className="tag">{preset.surface}</span><span className="tag">{model?.label??"Verified model"}</span></div><form className="stack" onSubmit={e=>{e.preventDefault();update(preset.surface,{modelId:preset.modelId,prompt:preset.promptTemplate.replaceAll("{prompt}",subject),settings:preset.settings,presetId:preset.id,media:[]});router.push("/"+preset.surface);}}><label className="field">Your subject or creative brief<input placeholder="A ceramic coffee cup for a new seasonal campaign" value={subject} onChange={e=>setSubject(e.target.value)} required minLength={3} maxLength={1000}/></label><button className="button primary full" disabled={!model}>Use this effect<ArrowUpRight size={17}/></button></form><div className="prompt-preview"><span className="eyebrow" style={{display:"block",marginBottom:9}}>PROMPT RECIPE</span>{preset.promptTemplate}</div></div></div></section>;
}
export function CommunityPage() {
 const {data,loading,reload}=useStudio();const [surface,setSurface]=useState("all"),[search,setSearch]=useState("");
 const items=(data?.community??[]).filter(item=>(surface==="all"||item.surface===surface)&&item.prompt.toLowerCase().includes(search.toLowerCase()));
 if(loading)return <Spinner/>;
 return <section className="page-wrap"><PageHeading eyebrow="SHARED PERSPECTIVES" title="The work, and what made it." description="Explore published creations, inspect the creative direction, and start a new iteration. Private work never appears here."/><div className="filter-bar"><div className="tabs">{["all","image","video","audio"].map(item=><button key={item} onClick={()=>setSurface(item)} className={"capitalize "+(surface===item?"active":"")}>{item==="all"?"Everything":item}</button>)}</div><div className="search-field"><Search size={16}/><input aria-label="Search community" placeholder="Search published prompts" value={search} onChange={e=>setSearch(e.target.value)}/></div></div>{items.length?<GenerationGallery items={items} publicView onChange={reload}/>:<EmptyState icon={<Globe size={28}/>} title={search?"No matching work":"A shared space, ready for your work."} description={search?"Try a different search or media type.":"Publish a completed generation from your library to share its media, prompt and settings."} action={<Link href="/assets" className="button">Open your library<ArrowUpRight size={17}/></Link>}/>}</section>;
}
export function PublicGenerationPage({id}:{id:string}) {
 const [generation,setGeneration]=useState<GenerationView|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
 async function load() {try{setGeneration((await api<{generation:GenerationView}>("/api/generations/"+id)).generation);setError("");}catch(e){setError(messageOf(e));}finally{setLoading(false);}}
 useEffect(()=>{let active=true;void api<{generation:GenerationView}>("/api/generations/"+id).then(result=>{if(active){setGeneration(result.generation);setError("");}}).catch(e=>{if(active)setError(messageOf(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[id]);
 return <section className="page-wrap">{loading?<Spinner/>:error?<ErrorNotice message={error} retry={()=>void load()}/>:generation?<><PageHeading eyebrow="CREATIVE RECORD" title="Behind the frame." description="The media, prompt and settings that brought this iteration together." actions={<Link className="button" href="/community">Explore Community</Link>}/><GenerationDetail generation={generation} onChange={load}/></>:<EmptyState icon={<ImageIcon size={25}/>} title="Generation unavailable" description="The generation may be private or removed."/ >}</section>;
}
