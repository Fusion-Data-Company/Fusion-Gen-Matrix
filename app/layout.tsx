import type {Metadata} from "next";
import "./globals.css";
import {StudioProvider} from "@/components/studio-context";
import {AppShell} from "@/components/app-shell";
export const metadata:Metadata={title:{default:"Fusion Gen Matrix — Creative systems",template:"%s · Fusion Gen Matrix"},description:"A focused studio for creating images and motion, organizing assets, and keeping the process behind your best work."};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body><StudioProvider><AppShell>{children}</AppShell></StudioProvider></body></html>;}
