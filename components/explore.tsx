"use client";
import Link from "next/link";
import {ArrowUpRight,ArrowRight,ImageIcon,Film,Layers,FolderOpen,Globe,Sparkles} from "lucide-react";
import {useStudio} from "./studio-context";
import {GenerationGallery} from "./generations";
import {Spinner} from "./ui";
import {ConceptArt,ConceptLabel} from "./concept-art";

export function ExplorePage() {
 const {data,loading,reload}=useStudio();
 if(loading)return <Spinner label="Opening Fusion Gen Matrix"/>;
 const image=data?.models.find(model=>model.surface==="image"),video=data?.models.find(model=>model.surface==="video");
 const studio=(surface:string,id?:string)=>"/"+surface+(id?"?model="+encodeURIComponent(id):"");
 const stories=[
  {title:"A FRAME THAT FEELS LIKE YOU",detail:"Shape the light. Find the character. Make the image.",href:studio("image",image?.id),scene:0,tag:"IMAGE STUDIO",action:"Create image"},
  {title:"GIVE YOUR WORLD MOTION",detail:"From a single frame to a cinematic sequence.",href:studio("video",video?.id),scene:1,tag:"VIDEO STUDIO",action:"Create video"},
  {title:"A DIFFERENT DIRECTION",detail:"Explore ready-to-use product and motion recipes.",href:"/effects",scene:3,tag:"CREATIVE EFFECTS",action:"Explore effects"},
 ];
 const tools=[
  {name:image?.family??"Image studio",description:"Portraits, products and visual ideas",href:studio("image",image?.id),Icon:ImageIcon,label:"IMAGE"},
  {name:video?.family??"Video studio",description:"Create motion from text and references",href:studio("video",video?.id),Icon:Film,label:"VIDEO"},
  {name:"Creative effects",description:"Start with a reusable creative direction",href:"/effects",Icon:Sparkles,label:"RECIPES"},
  {name:"Your library",description:"Every output, prompt and source together",href:"/assets",Icon:FolderOpen,label:"WORKSPACE"},
  {name:"Projects",description:"Organize your work by campaign",href:"/assets",Icon:Layers,label:"ORGANIZE"},
  {name:"Community",description:"Explore work creators chose to share",href:"/community",Icon:Globe,label:"DISCOVER"},
 ];
 return <section className="explore-page">
  <h1 className="sr-only">Fusion Gen Matrix creative studio</h1>
  <div className="discovery-rail" aria-label="Featured creative tools">{stories.map(story=><Link className="discovery-story" href={story.href} key={story.title}><div className="story-media"><ConceptArt scene={story.scene} priority/><div className="story-shade"/><span className="story-tag">{story.tag}</span><div className="story-overlay"><h2>{story.title}</h2><span className="story-action">{story.action}<ArrowUpRight size={17}/></span></div><ConceptLabel/></div><p>{story.detail}</p></Link>)}</div>
  <div className="discovery-workspace"><Link className="workspace-feature" href="/image"><ConceptArt scene={2}/><div className="story-shade"/><div><span className="eyebrow">FUSION GEN MATRIX</span><h2>ONE STUDIO.<br/><em>EVERY ITERATION.</em></h2><p>Images, motion, references and the process behind them.</p><span className="button primary">Open image studio<ArrowUpRight size={16}/></span></div><ConceptLabel/></Link><div className="tool-grid">{tools.map(({name,description,href,Icon,label})=><Link className="tool-card" href={href} key={name}><div className="tool-card-top"><Icon size={23}/><span>{label}</span></div><h3>{name}</h3><p>{description}</p></Link>)}</div></div>
  <div className="section-heading"><div><h2>EXPLORE CREATIVE EFFECTS</h2><p>Choose a direction, add your subject, then make it your own.</p></div><Link href="/effects">View all<ArrowRight size={16}/></Link></div>
  <div className="effect-rail">{data?.presets.map((preset,index)=><Link className="effect-poster" href={"/effects/"+preset.slug} key={preset.id}><ConceptArt scene={index}/><div className="story-shade"/><span className="effect-category">{preset.category}</span><div className="effect-poster-copy"><h3>{preset.title}</h3><p>{preset.surface} recipe<ArrowUpRight size={16}/></p></div><ConceptLabel/></Link>)}</div>
  <div className="section-heading"><div><h2>FROM THE COMMUNITY</h2><p>Published work with the prompt and settings behind it.</p></div><Link href="/community">Explore community<ArrowRight size={16}/></Link></div>
  {data?.community.length?<GenerationGallery items={data.community.slice(0,9)} publicView onChange={reload}/>:<div className="community-start"><Globe size={25}/><div><h3>Your work stays private until you share it.</h3><p>Create an image, keep the iterations you love, and publish from your library.</p></div><Link className="button" href="/image">Start creating<ArrowUpRight size={15}/></Link></div>}
  <p className="art-disclosure">Preview artwork was created for Fusion. It demonstrates creative direction, not output from the selected model.</p>
 </section>;
}
