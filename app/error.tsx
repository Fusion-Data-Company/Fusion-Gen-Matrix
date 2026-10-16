"use client";
import {ErrorNotice,PageHeading} from "@/components/ui";
export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}) {return <section className="page-wrap"><PageHeading title="This view couldn’t load" description="Your saved work is kept on the server."/><ErrorNotice message="An unexpected error interrupted this view." retry={reset}/></section>;}
