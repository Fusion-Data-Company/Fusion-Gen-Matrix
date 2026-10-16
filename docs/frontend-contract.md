# App contract
Shared domain types: lib/types.ts. Provider agent owns lib/catalog/index.ts, exports models/getModel/validateInput/mapToProvider/priceFor and ModelEntry. Model settings discriminated kind enum/range/boolean/text with key,label,default. roles array {role,kind,max,required?}, modes string[]; price can be null.
All JSON APIs return documented object or {error:string,code:string}; HTTP errors handled visibly.
GET /api/studio -> {mode:"demo"|"live",user:Profile|null,models:ModelEntry[],presets:Preset[],plans:Plan[],capabilities:{generation:boolean,billing:boolean,auth:boolean,storage:boolean},community:Generation[]}.
GET /api/generations?surface=image&projectId=... -> {items:Generation[]}. GET /api/generations/status?ids=a,b -> {items:Generation[]}, DB read only.
POST /api/generations body {idempotencyKey:UUID,modelId,prompt,settings,media:[{id,role}],projectId?,presetId?,demoOutcome?} -> {generation:Generation}. Price computed server side. In demo outputs are clearly labeled local fixtures.
POST /api/generations/[id] body {action:"cancel"|"refresh"|"publish"|"unpublish"|"delete"|"move",projectId?} -> {generation?:Generation,ok:true}. Repeat cancel/refund idempotent.
GET /api/generations/[id] -> {generation} own or public; public hides user private data.
GET /api/projects -> {items:Project[]}; POST {name} -> {project}. PATCH /api/projects/[id] {name} -> {project}; DELETE same.
GET /api/uploads -> {items:Upload[]}. POST /api/uploads multipart FormData file -> {upload}. Server validates actual bytes and magic and owns provider upload. Reference input only ids from uploaded/owned generation. For reuse, media id may be generation id.
GET /api/account -> {user:Profile,ledger:LedgerEntry[]}. POST /api/billing/checkout {planId?,interval?:"monthly"|"annual",packId?:"small"|"medium"|"large"} -> {url}; POST /api/billing/portal -> {url}. No billing if no provider price config. Demo uses explicitly labeled POST /api/demo/credits {amount:100} -> {user}; never simulated Stripe payment.
POST /api/demo/login {email} -> {user}; sets preview session cookie, allowed only local demo. POST /api/demo/logout signs out. Live Auth.js magic link via /api/auth/signin/resend, use next-auth/react signIn("resend",{email,redirectTo:"/assets"}).
GET /api/admin -> {users,generations,reports,presets,pricing}; POST body {action:"adjust-credits"|"toggle-model"|"set-price"|"save-preset"|"delete-preset"|"moderate",userId?,delta?,note?,modelId?,enabled?,usd?,preset?,presetId?,generationId?,reportId?}. Admin only.
POST /api/reports {generationId,reason} -> {ok:true}.
Protected media GET /api/media/[...key] uses auth or explicitly public generation.
All client writes same-origin. User role display never grants server authority.
