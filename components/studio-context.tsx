"use client";
import {createContext,useContext,useCallback,useState,useEffect,type ReactNode} from "react";
import {useRouter} from "next/navigation";
import {signIn,signOut} from "next-auth/react";
import {Check, FlaskConical, Mail, X} from "lucide-react";
import type {Profile, Preset,Plan,GenerationView} from "@/lib/types";
import type {ModelEntry} from "@/lib/catalog";
import {api,post,messageOf} from "@/lib/client/api";
import {useDock} from "@/lib/client/dock";
import {Modal,ErrorNotice} from "./ui";
export interface StudioData {mode:"demo"|"live"|"showcase";user:Profile|null;models:ModelEntry[];presets:Preset[];plans:Plan[];capabilities:{generation:boolean;billing:boolean;auth:boolean;storage:boolean};community:GenerationView[]}
interface StudioContext {data:StudioData|null;loading:boolean;error:string;reload:()=>Promise<void>;notice:(message:string)=>void;requireLogin:()=>boolean;openLogin:()=>void;logout:()=>Promise<void>;openUpgrade:()=>void}
const Context=createContext<StudioContext|null>(null);
export function useStudio() {const context=useContext(Context);if(!context)throw new Error("StudioProvider is missing");return context;}
export function StudioProvider({children}:{children:ReactNode}) {
 const [data,setData]=useState<StudioData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[login,setLogin]=useState(false),[upgrade,setUpgrade]=useState(false),[toast,setToast]=useState("");
 const router=useRouter();
 const reload=useCallback(async()=>{try{const result=await api<StudioData>("/api/studio");useDock.getState().claim(result.user?.id??null);setData(result);setError("");}catch(e){setError(messageOf(e));}finally{setLoading(false);}},[]);
 useEffect(()=>{let active=true;void Promise.resolve(useDock.persist.rehydrate()).then(()=>api<StudioData>("/api/studio")).then(result=>{if(active){useDock.getState().claim(result.user?.id??null);setData(result);setError("");}}).catch(e=>{if(active)setError(messageOf(e));}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(""),5000);return()=>clearTimeout(timer);},[toast]);
 useEffect(()=>{const refresh=()=>{if(document.visibilityState==="visible")void reload();};const syncDraft=(event:StorageEvent)=>{if(event.key!=="fusion-studio-drafts-v1")return;try{const saved=JSON.parse(event.newValue??"null");if(saved?.state?.ownerId===useDock.getState().ownerId)void useDock.persist.rehydrate();else void reload();}catch{/* Ignore corrupt device data. */}};window.addEventListener("focus",refresh);window.addEventListener("storage",syncDraft);return()=>{window.removeEventListener("focus",refresh);window.removeEventListener("storage",syncDraft);};},[reload]);
 const logout=useCallback(async()=>{try{useDock.getState().clear();if(data?.mode==="demo"){await post("/api/demo/logout",{});await reload();router.push("/");}else await signOut({redirectTo:"/"});}catch(e){setToast(messageOf(e));}},[data,reload,router]);
 const requireLogin=useCallback(()=>{if(!data?.user){setLogin(true);return false;}return true;},[data?.user]);
 return <Context.Provider value={{data,loading,error,reload,notice:setToast,requireLogin,openLogin:()=>setLogin(true),logout,openUpgrade:()=>setUpgrade(true)}}>
 {children}
 <Modal open={login} onClose={()=>setLogin(false)} title="Your next idea starts here" description="Sign in to save work and keep your creative projects together."><LoginForm onDone={()=>setLogin(false)}/></Modal>
 <Modal open={upgrade} onClose={()=>setUpgrade(false)} title="More room to create" description={data?.mode==="demo"?"Preview credits are local test units with no monetary value.":"You need more credits for this generation."}>
  <p className="muted">Your current balance is {(data?.user?.subscriptionCredits??0)+(data?.user?.topupCredits??0)} credits.</p>
  {data?.mode==="demo"?<button className="button primary full" onClick={async()=>{try{await post("/api/demo/credits",{amount:100});await reload();setUpgrade(false);setToast("100 local preview credits added.");}catch(e){setToast(messageOf(e));}}}>Add 100 preview credits</button>:<button className="button primary full" onClick={()=>{setUpgrade(false);router.push("/pricing");}}>View credit options</button>}
 </Modal>
 {toast&&<div className="toast" role="status"><Check size={17}/><span>{toast}</span><button className="icon-button" title="Dismiss notification" aria-label="Dismiss notification" onClick={()=>setToast("")}><X size={16}/></button></div>}
 </Context.Provider>;
}
export function LoginForm({onDone}:{onDone?:()=>void}) {
 const {data,reload,notice}=useStudio();const router=useRouter();
 const [email,setEmail]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function submit(event:React.FormEvent) {event.preventDefault();setBusy(true);setError("");try{
   if(data?.mode==="demo"){await post<{user:Profile}>("/api/demo/login",{email});await reload();notice("Signed into the local preview. No email was sent.");onDone?.();router.refresh();}
   else {const result=await signIn("resend",{email,redirect:false,redirectTo:location.pathname.startsWith("/login")?"/assets":location.pathname+location.search});if(result?.error)throw new Error("The sign-in email could not be sent. Please try again.");onDone?.();router.push("/login/check-email");}
 }catch(e){setError(messageOf(e));}finally{setBusy(false);}}
 return <form onSubmit={submit} className="stack">
  {data?.mode==="demo"&&<div className="info-note"><FlaskConical size={19}/><span><strong>Local preview account</strong><br/>No email is sent. Use operator@preview.local to review administration, or another address to try an ordinary account.</span></div>}
  {data?.mode==="showcase"&&<div className="info-note"><FlaskConical size={19}/><span><strong>Public showcase</strong><br/>Account registration and generation are awaiting live service configuration. This form does not accept sign-ins yet.</span></div>}
  <label className="field">Email address<input type="email" autoComplete="email" placeholder={data?.mode==="demo"?"operator@preview.local":"you@company.com"} value={email} onChange={e=>setEmail(e.target.value)} required/></label>
  {error&&<ErrorNotice message={error}/>}
  <button type="submit" className="button primary full" disabled={busy||!data||(data.mode!=="demo"&&!data.capabilities.auth)}><Mail size={17}/>{busy?"Signing in…":data?.mode==="demo"?"Enter local preview":"Send a magic link"}</button>
  {data?.mode!=="demo"&&data&&!data.capabilities.auth&&<p className="small muted">Email sign-in is awaiting service configuration.</p>}
  <p className="small muted">By continuing you acknowledge the <a href="/legal/terms">draft terms</a> and <a href="/legal/privacy">privacy notice</a>.</p>
 </form>;
}
