import {NextResponse,type NextRequest} from "next/server";
export function proxy(request:NextRequest){
 const mode=process.env.APP_MODE??(process.env.VERCEL?"showcase":"demo");
 if(mode==="demo"){
  const host=(request.headers.get("host")??"").toLowerCase();
  if(!/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host))return NextResponse.json({code:"LOCAL_PREVIEW_ONLY",error:"Local preview is available only on loopback."},{status:403});
 }
 if(mode==="showcase"&&request.nextUrl.pathname.startsWith("/api/")&&!["GET","HEAD"].includes(request.method))return NextResponse.json({code:"SHOWCASE_READ_ONLY",error:"This hosted preview is read-only. Live generation, accounts and billing need operator configuration."},{status:503});
 return NextResponse.next();
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};
