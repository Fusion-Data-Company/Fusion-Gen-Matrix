import fs from "node:fs";
import path from "node:path";
const root=path.resolve(".next/static");
if(!fs.existsSync(root)){console.error("Build output is missing; run the production build first.");process.exit(1);}
const names=["HF_CREDENTIALS","AUTH_SECRET","AUTH_RESEND_KEY","STRIPE_SECRET_KEY","STRIPE_WEBHOOK_SECRET","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY","CRON_SECRET"];
const secrets=names.map(name=>({name,value:process.env[name]})).filter(x=>x.value&&x.value.length>=12);
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?files(path.join(dir,x.name)):[path.join(dir,x.name)]);}
let checked=0;for(const file of files(root)){if(!/\.(js|map|json|html|css)$/.test(file))continue;checked++;const text=fs.readFileSync(file,"utf8");
 for(const secret of secrets)if(text.includes(secret.value)){console.error("Client bundle contains server secret variable: "+secret.name);process.exit(1);}
 if(/\b(sk_live_|sk_test_|whsec_)[A-Za-z0-9]{16,}/.test(text)){console.error("A private-key-shaped value was found in client output.");process.exit(1);}
}
console.log("Client secret scan passed across "+checked+" generated files; no secret values were printed.");
