import type {Metadata} from "next";
import "./globals.css";
import "./studio-refresh.css";
import localFont from "next/font/local";
const bodyFont=localFont({src:"../public/fonts/DMSans.ttf",variable:"--font-body",display:"swap"});
const displayFont=localFont({src:"../public/fonts/BarlowCondensed-SemiBold.ttf",variable:"--font-display",display:"swap"});
import {StudioProvider} from "@/components/studio-context";
import {AppShell} from "@/components/app-shell";
export const metadata:Metadata={title:{default:"Fusion Gen Matrix — Creative systems",template:"%s · Fusion Gen Matrix"},description:"A focused studio for creating images and motion, organizing assets, and keeping the process behind your best work."};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en" className={bodyFont.variable+" "+displayFont.variable}><body><StudioProvider><AppShell>{children}</AppShell></StudioProvider></body></html>;}
