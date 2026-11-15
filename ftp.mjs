import FtpSrv from 'ftp-srv';
import path from 'node:path';
import {PassThrough} from 'node:stream';
import {createReadStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {timingSafeEqual} from 'node:crypto';
import {config,virtualDates} from './config.mjs';
const quiet={trace(){},debug(){},info(){},warn(){},error(){},fatal(){},child(){return this;}};
const same=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);};
const hhmmss=seconds=>{const d=new Date(seconds*1000);return [d.getHours(),d.getMinutes(),d.getSeconds()].map(v=>String(v).padStart(2,'0')).join('-');};
export const ftpFilename=r=>`Cam${String(r.channel).padStart(2,'0')}_${hhmmss(r.start)}_${hhmmss(r.end)}_${r.id.slice(0,8)}.mp4`;
export function ftpEntries(rows){return rows.flatMap(record=>{const result=[];for(let start=record.start;start<record.end;start+=3600)result.push({...record,start,end:Math.min(record.end,start+3600)});return result;});}
const fileStat=(name,directory,date,size=0)=>({name,size,mtime:new Date(date),atime:new Date(date),ctime:new Date(date),mode:directory?0o40555:0o100444,uid:0,gid:0,nlink:1,isDirectory:()=>directory,isFile:()=>!directory,isSymbolicLink:()=>false});
export class VirtualArchiveFS{
 constructor(getClient,manager){this.cwd='/';this.getClient=getClient;this.manager=manager;}
 currentDirectory(){return this.cwd;}
 resolve(value='.'){return path.posix.resolve(this.cwd,String(value).replaceAll('\\','/'));}
 async list(value='.'){
  const resolved=this.resolve(value);if(resolved==='/')return virtualDates().map(date=>fileStat(date,true,date+'T12:00:00'));
  const parts=resolved.slice(1).split('/');if(parts.length!==1||!virtualDates().includes(parts[0]))throw new Error('Directory not found.');
  const rows=ftpEntries(await(await this.getClient()).day(parts[0]));return rows.map(r=>fileStat(ftpFilename(r),false,r.end*1000));
 }
 async get(value){const resolved=this.resolve(value);if(resolved==='/')return fileStat('/',true,new Date());const parts=resolved.slice(1).split('/');if(parts.length===1&&virtualDates().includes(parts[0]))return fileStat(parts[0],true,parts[0]+'T12:00:00');if(parts.length!==2)throw new Error('Not found.');const result=(await this.list('/'+parts[0])).find(s=>s.name===parts[1]);if(!result)throw new Error('Not found.');return result;}
 async chdir(value){const resolved=this.resolve(value),s=await this.get(resolved);if(!s.isDirectory())throw new Error('Not a directory.');this.cwd=resolved;return this.cwd;}
 async read(value,{start=0}={}){
  if(start)throw new Error('Virtual files must be downloaded from the beginning.');const resolved=this.resolve(value),parts=resolved.slice(1).split('/');if(parts.length!==2||!virtualDates().includes(parts[0]))throw new Error('Not found.');
  const client=await this.getClient(),rows=ftpEntries(await client.day(parts[0])),record=rows.find(r=>ftpFilename(r)===parts[1]);if(!record)throw new Error('Not found.');
  const output=new PassThrough();output.on('error',()=>{});
  const job=this.manager.create(client,record,{duration:Math.min(3600,record.end-record.start)});
  job.promise.then(done=>{if(output.destroyed)return;if(done.state!=='ready')return output.destroy(new Error('Archive preparation failed.'));const input=createReadStream(done.output.file);input.on('error',()=>output.destroy(new Error('Archive transfer failed.')));output.on('close',()=>input.destroy());input.pipe(output);}).catch(()=>output.destroy(new Error('Archive preparation failed.')));
  return {stream:output,clientPath:resolved};
 }
}
export async function startFtp(getClient,manager){
 const username=process.env.FTP_USERNAME||'';
 const password=process.env.FTP_PASSWORD_FILE?(await readFile(process.env.FTP_PASSWORD_FILE,'utf8')).replace(/[\r\n]+$/,''):(process.env.FTP_PASSWORD||'');
 if(!username||!password)throw new Error('FTP credentials are required.');
 let tls;if(process.env.FTP_TLS_CERT&&process.env.FTP_TLS_KEY)tls={cert:await readFile(process.env.FTP_TLS_CERT),key:await readFile(process.env.FTP_TLS_KEY)};
 const server=new FtpSrv({url:`ftp://${process.env.FTP_LISTEN_HOST||config.listen}:${Number(process.env.FTP_PORT||2121)}`,anonymous:false,greeting:'Noxis virtual archives — read only',pasv_url:process.env.FTP_PASV_ADDRESS||'127.0.0.1',pasv_min:Number(process.env.FTP_PASV_MIN||50000),pasv_max:Number(process.env.FTP_PASV_MAX||50009),log:quiet,...(tls?{tls}:{})});
 server.on('login',({username:user,password:pass},resolve,reject)=>{if(!same(user,username)||!same(pass,password))return reject(new Error('Authentication failed.'));resolve({fs:new VirtualArchiveFS(getClient,manager),whitelist:['USER','PASS','QUIT','FEAT','SYST','PWD','XPWD','CWD','CDUP','TYPE','PASV','EPSV','LIST','NLST','STAT','MDTM','RETR','NOOP','OPTS','ABOR','AUTH','PBSZ','PROT']});});
 server.on('server-error',()=>{});await server.listen();console.log('Noxis virtual FTP ready');return server;
}
