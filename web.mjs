import http from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {config,configured,credentials,virtualDates,failure} from './config.mjs';
import {NvrClient} from './nvr.mjs';
import {ExportManager} from './exports.mjs';
import {captureReplay} from './replay.mjs';
import {streamLive} from './media.mjs';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'public');
export const exportsManager=new ExportManager();
let configuredClient,loginPending;
export async function getConfiguredClient(){
 if(!configured())throw failure('Docker NVR credentials are not configured.',401,'LOGIN_REQUIRED');
 if(configuredClient&&configuredClient.validUntil>Date.now())return configuredClient;
 if(loginPending)return loginPending;
 loginPending=(async()=>{const c=await credentials();const client=configuredClient&&configuredClient.username===c.username&&configuredClient.password===c.password?configuredClient:new NvrClient(c.username,c.password);await client.login();client.validUntil=Date.now()+25*60000;configuredClient=client;return client;})();
 try{return await loginPending;}finally{loginPending=null;}
}
function tokenMatches(value){if(!config.apiToken||!value)return false;const a=Buffer.from(value),b=Buffer.from('Bearer '+config.apiToken);return a.length===b.length&&timingSafeEqual(a,b);}
export function validateSearch(q){
 if(!q||!Array.isArray(q.Channel)||q.Channel.length<1||q.Channel.length>64||q.Channel.some(v=>!['True','False'].includes(v))||!q.Channel.includes('True'))throw failure('Select at least one camera.');
 if(!Array.isArray(q.Type)||![3,4].includes(q.Type.length)||q.Type.some(v=>!['True','False'].includes(v))||!q.Type.includes('True'))throw failure('Select at least one event type.');
 if(typeof q.Date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(q.Date)||!Number.isFinite(Date.parse(q.Date))||new Date(q.Date).toISOString().slice(0,10)!==q.Date)throw failure('Invalid date.');
 for(const key of ['BeginTime','EndTime'])if(typeof q[key]!=='string'||!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(q[key]))throw failure('Invalid time.');
 if(q.BeginTime>q.EndTime||![12,25,50,100].includes(q.PageSize)||!Number.isInteger(q.CurrentPage)||q.CurrentPage<1||q.CurrentPage>10000)throw failure('Invalid search range.');
 return {Channel:q.Channel,Type:q.Type,Date:q.Date,BeginTime:q.BeginTime,EndTime:q.EndTime,PageSize:q.PageSize,CurrentPage:q.CurrentPage,Reload:'True'};
}
export function createApp(){
 const sessions=new Map(),streams=new Set();
 const timer=setInterval(()=>{for(const [id,s]of sessions)if(s.expires<Date.now()){for(const c of s.streams)c.abort();sessions.delete(id);}},15000);timer.unref();
 const app=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const json=(status,data)=>{if(res.destroyed||res.headersSent)return;res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  try{
   const hostname=String(req.headers.host||'').replace(/:\d+$/,'').toLowerCase();if(!config.allowedHosts.includes(hostname))throw failure('Host not allowed. Configure ALLOWED_HOSTS.',403,'HOST');
   const url=new URL(req.url,'http://'+req.headers.host);
   if(req.method==='GET'&&url.pathname==='/healthz')return json(200,{ok:true,name:'Noxis',version:'1.0.0'});
   if(req.method==='GET'&&['/','/app.js','/style.css'].includes(url.pathname)){const file=url.pathname==='/'?'index.html':url.pathname.slice(1);res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');return res.end(await readFile(path.join(root,file)));}
   if(req.method==='GET'&&url.pathname==='/api/config')return json(200,{configured:configured(),channels:config.channels,host:config.host,archiveDays:config.archiveDays,dates:virtualDates(),ftpEnabled:process.env.FTP_ENABLED==='true'});
   const apiToken=tokenMatches(req.headers.authorization);if(req.headers.authorization&&!apiToken)throw failure('Invalid API token.',401,'LOGIN_REQUIRED');
   if(req.method!=='GET'&&!apiToken&&(req.headers.origin!=='http://'+req.headers.host||req.headers['x-noxis-client']!=='1'))throw failure('Origin not allowed.',403,'ORIGIN');
   let body={};if(req.method==='POST'){if(!String(req.headers['content-type']).startsWith('application/json'))throw failure('JSON body required.',415);let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16384)throw failure('Request too large.',413);}try{body=JSON.parse(raw||'{}');}catch{throw failure('Invalid JSON.');}}
   const sid=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('noxis_session='))?.slice(14);
   let session=sessions.get(sid);if(session&&session.expires<Date.now()){sessions.delete(sid);session=null;}
   if(req.method==='POST'&&url.pathname==='/api/session'){
    let client;if(configured())client=await getConfiguredClient();else{if(typeof body.username!=='string'||typeof body.password!=='string'||!body.username||body.username.includes(':')||body.username.length>128||body.password.length>512)throw failure('Enter valid credentials.');client=await new NvrClient(body.username,body.password).login();}
    if(sessions.size>100)throw failure('Too many sessions.',429);if(session)for(const c of session.streams)c.abort();sessions.delete(sid);
    const id=randomBytes(32).toString('hex');sessions.set(id,{client,expires:Date.now()+8*3600000,streams:new Set()});res.setHeader('Set-Cookie',`noxis_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);return json(200,{ok:true,channels:config.channels,configured:configured()});
   }
   if(req.method==='POST'&&url.pathname==='/api/logout'){if(session)for(const c of session.streams)c.abort();sessions.delete(sid);res.setHeader('Set-Cookie','noxis_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(200,{ok:true});}
   const client=apiToken?await getConfiguredClient():session?.client;if(!client)throw failure('Connect to the NVR.',401,'LOGIN_REQUIRED');
   if(req.method==='GET'&&url.pathname==='/api/session')return json(200,{ok:true,configured:configured(),channels:config.channels});
   if(req.method==='GET'&&url.pathname==='/api/days')return json(200,{dates:virtualDates()});
   if(req.method==='GET'&&url.pathname==='/api/info')return json(200,await client.info());
   if(req.method==='GET'&&url.pathname==='/api/recordings')return json(200,{rows:await client.day(url.searchParams.get('date'))});
   if(req.method==='POST'&&url.pathname==='/api/search')return json(200,await client.search(validateSearch(body)));
   if(req.method==='POST'&&url.pathname==='/api/exports'){const record=client.records.get(body.recordId);if(!record)throw failure('Run a search and select a recording.');const job=exportsManager.create(client,record,{offset:body.offset??0,duration:body.duration??Math.min(record.end-record.start,3600),browser:body.browser===true});return json(202,exportsManager.view(job));}
   const match=url.pathname.match(/^\/api\/exports\/([a-f0-9]{40})(?:\/(file|cancel))?$/);
   if(match){const job=exportsManager.get(match[1],client);
    if(req.method==='POST'&&match[2]==='cancel'){job.controller.abort();return json(200,{ok:true});}
    if(req.method==='GET'&&match[2]==='file'){
     if(job.state!=='ready')throw failure('Export is not ready.',409,'EXPORT_PENDING');const size=(await stat(job.output.file)).size;let start=0,end=size-1,status=200;
     if(req.headers.range){const r=req.headers.range.match(/^bytes=(\d+)-(\d*)$/);if(!r)throw failure('Invalid range.',416);start=Number(r[1]);end=r[2]?Math.min(Number(r[2]),size-1):size-1;if(start>=size||start>end)throw failure('Invalid range.',416);status=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);}
     res.writeHead(status,{'Content-Type':'video/mp4','Content-Length':end-start+1,'Accept-Ranges':'bytes','Content-Disposition':`${url.searchParams.get('inline')==='1'?'inline':'attachment'}; filename="${exportsManager.filename(job)}"`});await pipeline(createReadStream(job.output.file,{start,end}),res);return;
    }
    if(req.method==='GET'&&!match[2])return json(200,exportsManager.view(job));
   }
   if(req.method==='POST'&&url.pathname==='/api/live'){
    if(!Number.isInteger(body.channel)||body.channel<1||body.channel>config.channels)throw failure('Invalid camera.');if(streams.size>=8||(session&&session.streams.size>=4))throw failure('Too many live streams.',429,'LIVE_BUSY');
    const controller=new AbortController();streams.add(controller);session?.streams.add(controller);res.on('close',()=>controller.abort());res.writeHead(200,{'Content-Type':'application/octet-stream'});res.flushHeaders();
    try{await streamLive(captureReplay,{username:client.username,password:client.password,host:config.host,port:config.videoPort,channel:body.channel-1,stream:body.stream===0?0:1},res,{signal:controller.signal});}finally{controller.abort();streams.delete(controller);session?.streams.delete(controller);res.end();}return;
   }
   throw failure('Not found.',404,'NOT_FOUND');
  }catch(error){if(res.headersSent){res.destroy();return;}json(error.status||502,{error:error.status?error.message:'Video operation failed.',code:error.code||'MEDIA_ERROR'});}
 });
 app.on('close',()=>{clearInterval(timer);for(const c of streams)c.abort();sessions.clear();});return app;
}
export async function start(){const server=createApp();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(config.port,config.listen,resolve);});console.log(`Noxis ready on port ${config.port}`);if(process.env.FTP_ENABLED==='true'){const {startFtp}=await import('./ftp.mjs');await startFtp(getConfiguredClient,exportsManager);}return server;}
