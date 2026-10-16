import type {NextConfig} from "next";
import {configuredUploadOrigins} from "./lib/upload-origins";
const uploadOrigins=configuredUploadOrigins(undefined,true);
const dev=process.env.NODE_ENV!=="production";
const csp=["default-src 'self'","base-uri 'self'","object-src 'none'","frame-ancestors 'none'","form-action 'self'","img-src 'self' data: blob:","media-src 'self' blob:","font-src 'self' data:","connect-src 'self'"+(uploadOrigins.length?" "+uploadOrigins.join(" "):""),"style-src 'self' 'unsafe-inline'","script-src 'self' 'unsafe-inline'"+(dev?" 'unsafe-eval'":"")].join("; ");
const config:NextConfig={
 poweredByHeader:false,
 serverExternalPackages:["mongodb"],
 async headers(){return [{source:"/:path*",headers:[{key:"Content-Security-Policy",value:csp},{key:"X-Content-Type-Options",value:"nosniff"},{key:"X-Frame-Options",value:"DENY"},{key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},{key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},...(!dev?[{key:"Strict-Transport-Security",value:"max-age=31536000; includeSubDomains"}]:[])]}];}
};export default config;
