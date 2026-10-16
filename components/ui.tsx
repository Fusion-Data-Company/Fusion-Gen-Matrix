"use client";
import {Dialog} from "@base-ui/react/dialog";
import {X, LoaderCircle, AlertCircle, ArrowUpRight} from "lucide-react";
import Link from "next/link";
import type {ReactNode} from "react";
export function Modal({open,onClose,title,description,children,wide=false}:{open:boolean;onClose:()=>void;title:string;description?:string;children:ReactNode;wide?:boolean}) {
 return <Dialog.Root open={open} onOpenChange={value=>{if(!value)onClose();}}>
  <Dialog.Portal><Dialog.Backdrop className="dialog-backdrop"/><Dialog.Popup className={"dialog-popup "+(wide?"dialog-wide":"")}>
   <div className="dialog-heading"><div><Dialog.Title>{title}</Dialog.Title>{description&&<Dialog.Description>{description}</Dialog.Description>}</div><Dialog.Close className="icon-button" aria-label="Close dialog" title="Close dialog"><X size={19}/></Dialog.Close></div>
   {children}
  </Dialog.Popup></Dialog.Portal>
 </Dialog.Root>;
}
export function Spinner({label="Loading"}:{label?:string}) {return <div className="loading-state" role="status"><LoaderCircle className="spin" size={23}/><span>{label}</span></div>;}
export function ErrorNotice({message,retry}:{message:string;retry?:()=>void}) {return <div className="error-notice" role="alert"><AlertCircle size={18}/><span>{message}</span>{retry&&<button className="text-button" onClick={retry}>Try again</button>}</div>;}
export function EmptyState({icon,title,description,action}:{icon:ReactNode;title:string;description:string;action?:ReactNode}) {return <div className="empty-state"><div className="empty-icon">{icon}</div><h2>{title}</h2><p>{description}</p>{action}</div>;}
export function PageHeading({eyebrow,title,description,actions}:{eyebrow?:string;title:string;description?:string;actions?:ReactNode}) {return <div className="page-heading"><div>{eyebrow&&<div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{description&&<p>{description}</p>}</div>{actions&&<div className="heading-actions">{actions}</div>}</div>;}
export function RouteLink({href,children,primary=false}:{href:string;children:ReactNode;primary?:boolean}) {return <Link href={href} className={primary?"button primary":"button"}>{children}<ArrowUpRight size={16}/></Link>;}
export function StatusBadge({status}:{status:string}) {return <span className={"status-badge status-"+status}>{status.replaceAll("_"," ")}</span>;}
