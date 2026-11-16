import {readFile} from 'node:fs/promises';
export function deploymentUri(baseInput='',publicInput=''){
 const publicUrl=publicInput?new URL(publicInput):null;
 if(publicUrl&&(!['http:','https:'].includes(publicUrl.protocol)||publicUrl.username||publicUrl.password||publicUrl.search||publicUrl.hash))throw new Error('Invalid PUBLIC_URL');
 const basePath=(baseInput||publicUrl?.pathname||'').replace(/\/+$/,'');
 if(basePath&&(!/^\/(?:[A-Za-z0-9_~.-]+\/?)+$/.test(basePath)||basePath.split('/').some(p=>p==='.'||p==='..')))throw new Error('Invalid BASE_PATH');
 if(baseInput&&publicUrl&&publicUrl.pathname!=='/'&&publicUrl.pathname.replace(/\/+$/,'')!==basePath)throw new Error('PUBLIC_URL and BASE_PATH paths must match');
 return {basePath,publicUrl:publicUrl?publicUrl.origin+basePath+'/':'',publicOrigin:publicUrl?.origin||'',publicHost:publicUrl?.hostname||''};
}
const uri=deploymentUri(process.env.BASE_PATH||'',process.env.PUBLIC_URL||'');
export const config={
 host:process.env.NVR_HOST||'192.0.2.10',httpPort:Number(process.env.NVR_HTTP_PORT||80),videoPort:Number(process.env.NVR_VIDEO_PORT||10000),
 archiveDays:Math.min(3660,Math.max(1,Number(process.env.ARCHIVE_DAYS||30))),channels:Math.min(64,Math.max(1,Number(process.env.NBcam||process.env.NVR_CHANNELS||4))),
 exportConcurrency:Math.min(8,Math.max(1,Math.trunc(Number(process.env.EXPORT_CONCURRENCY)||1))),
 allowedHosts:(process.env.ALLOWED_HOSTS||'127.0.0.1,localhost').split(',').map(s=>s.trim().toLowerCase()),
 apiToken:process.env.NOXIS_API_TOKEN||'',port:Number(process.env.PORT||8787),listen:process.env.LISTEN_HOST||'127.0.0.1',...uri
};
export async function credentials(){return {username:process.env.NVR_USERNAME||'',password:process.env.NVR_PASSWORD_FILE?(await readFile(process.env.NVR_PASSWORD_FILE,'utf8')).replace(/[\r\n]+$/,''):(process.env.NVR_PASSWORD||'')};}
export const configured=()=>!!process.env.NVR_USERNAME&&!!(process.env.NVR_PASSWORD||process.env.NVR_PASSWORD_FILE);
export function virtualDates(days=config.archiveDays,now=new Date()){
 const result=[];for(let i=0;i<days;i++){const date=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);result.push(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`);}return result;
}
export const failure=(message,status=400,code='BAD_REQUEST')=>Object.assign(new Error(message),{status,code});
