"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useState,useEffect} from "react";
import {Menu, Sparkles, FolderOpen, UserRound, CreditCard, LogOut, Shield, ChevronDown, FlaskConical, ArrowUpRight} from "lucide-react";
import {useStudio} from "./studio-context";
import {Modal, ErrorNotice} from "./ui";
const links=[["Explore","/"],["Image","/image"],["Video","/video"],["Audio","/audio"],["Effects","/effects"],["Community","/community"],["Pricing","/pricing"]];
export function Brand() {return <Link className="brand" href="/" aria-label="Fusion Gen Matrix home"><svg width="28" height="29" viewBox="0 0 28 29" aria-hidden="true"><path fill="currentColor" d="M2 2h24v6H9v5h14v6H9v8H2z"/><path fill="var(--lime)" d="m19 22 7-7v12h-7z"/></svg><span>FUSION<span className="brand-sub">GEN MATRIX</span></span></Link>;}
export function AppShell({children}:{children:React.ReactNode}) {
 const path=usePathname(),{data,loading,error,reload,openLogin,logout}=useStudio();
 const [menu,setMenu]=useState(false),[account,setAccount]=useState(false),[consent,setConsent]=useState<string|null>(null),[preferences,setPreferences]=useState(false);
 useEffect(()=>{const id=setTimeout(()=>setConsent(localStorage.getItem("fusion-consent")??""),0);return()=>clearTimeout(id);},[]);
 function choose(value:string) {localStorage.setItem("fusion-consent",value);setConsent(value);setPreferences(false);}
 const nav=<nav aria-label="Primary navigation">{links.map(([label,href])=><Link key={href} href={href} onClick={()=>setMenu(false)} className={(href==="/"?path==="/":path.startsWith(href))?"nav-link active":"nav-link"}>{label}</Link>)}</nav>;
 return <div className="app-shell">
 <a href="#main" className="skip-link">Skip to content</a>
 <header className="app-header"><Brand/><div className="desktop-nav">{nav}</div><div className="header-actions">
 {data?.user?<><Link className="credit-pill" href="/account" title="View credit balance"><Sparkles size={14}/><span>{data.user.subscriptionCredits+data.user.topupCredits}</span><span className="credit-label">{data.mode==="demo"?"preview":"credits"}</span></Link><Link className="button compact upgrade-link" href="/pricing">Upgrade<ArrowUpRight size={14}/></Link><div className="account-menu-wrap"><button className="avatar-button" aria-expanded={account} aria-label="Account menu" onClick={()=>setAccount(!account)}>{(data.user.name||data.user.email).slice(0,1).toUpperCase()}<ChevronDown size={12}/></button>{account&&<><button className="menu-dismiss" aria-label="Close account menu" onClick={()=>setAccount(false)}/><div className="account-menu"><div className="menu-identity">{data.user.email}</div>{[["/assets","My assets",FolderOpen],["/account","Account",UserRound],["/account/billing","Billing",CreditCard],...(data.user.role==="admin"?[["/admin","Administration",Shield] as const]:[])].map(([href,label,Icon])=><Link key={String(href)} href={String(href)} onClick={()=>setAccount(false)}><Icon size={16}/>{String(label)}</Link>)}<button onClick={()=>{setAccount(false);void logout();}}><LogOut size={16}/>Sign out</button></div></>}</div></>:<><button className="text-button login-link" disabled={loading} onClick={openLogin}>Log in</button><button className="button compact" disabled={loading} onClick={openLogin}>Get started</button></>}
 <button className="icon-button mobile-menu-button" aria-label="Open navigation" title="Open navigation" onClick={()=>setMenu(true)}><Menu size={22}/></button></div></header>
 {(data?.mode==="demo"||data?.mode==="showcase")&&<div className="preview-bar"><FlaskConical size={14}/><span>{data.mode==="showcase"?"Public showcase. Rendering and account setup are not enabled.":"Local preview. Sample renders, no paid generation."}</span><Link href="/account">Preview status<ArrowUpRight size={12}/></Link></div>}
 {error&&<div className="global-error"><ErrorNotice message={error} retry={()=>void reload()}/></div>}
 <main id="main">{children}</main>
 <footer className="app-footer"><span>FUSION / CREATIVE SYSTEMS</span><div><Link href="/legal/terms">Terms</Link><Link href="/legal/privacy">Privacy</Link><Link href="/legal/acceptable-use">Acceptable use</Link><button onClick={()=>setPreferences(true)}>Cookies</button></div><span>© {new Date().getFullYear()} Fusion</span></footer>
 <Modal open={menu} onClose={()=>setMenu(false)} title="Studio navigation">{nav}<Link href="/assets" className="button full" onClick={()=>setMenu(false)}>My assets<FolderOpen size={17}/></Link></Modal>
 {consent===""&&<div className="cookie-banner"><div><strong>Your privacy, by default.</strong><p>Essential cookies keep you signed in. No analytics or advertising scripts are loaded.</p></div><div className="cookie-actions"><button className="button compact" onClick={()=>choose("essential")}>Reject non-essential</button><button className="button compact" onClick={()=>setPreferences(true)}>Preferences</button><button className="button compact" onClick={()=>choose("all")}>Accept all</button></div></div>}
 <Modal open={preferences} onClose={()=>setPreferences(false)} title="Cookie preferences" description="This studio currently uses essential session cookies only."><div className="settings-line"><div><strong>Essential</strong><p className="small muted">Authentication, security and your cookie preference.</p></div><span className="tag">Always on</span></div><p className="muted">Optional analytics and marketing are not installed. Your preference is saved locally.</p><button className="button full" onClick={()=>choose("essential")}>Save essential only</button></Modal>
 </div>;
}
