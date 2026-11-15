import {readFile} from 'node:fs/promises';
export const config={
 host:process.env.NVR_HOST||'192.0.2.10',httpPort:Number(process.env.NVR_HTTP_PORT||80),videoPort:Number(process.env.NVR_VIDEO_PORT||10000),
 archiveDays:Math.min(3660,Math.max(1,Number(process.env.ARCHIVE_DAYS||30))),channels:Math.min(64,Math.max(1,Number(process.env.NBcam||process.env.NVR_CHANNELS||4))),
 allowedHosts:(process.env.ALLOWED_HOSTS||'127.0.0.1,localhost').split(',').map(s=>s.trim().toLowerCase()),
 apiToken:process.env.NOXIS_API_TOKEN||'',port:Number(process.env.PORT||8787),listen:process.env.LISTEN_HOST||'127.0.0.1'
};
export async function credentials(){return {username:process.env.NVR_USERNAME||'',password:process.env.NVR_PASSWORD_FILE?(await readFile(process.env.NVR_PASSWORD_FILE,'utf8')).replace(/[\r\n]+$/,''):(process.env.NVR_PASSWORD||'')};}
export const configured=()=>!!process.env.NVR_USERNAME&&!!(process.env.NVR_PASSWORD||process.env.NVR_PASSWORD_FILE);
export function virtualDates(days=config.archiveDays,now=new Date()){
 const result=[];for(let i=0;i<days;i++){const date=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);result.push(`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`);}return result;
}
export const failure=(message,status=400,code='BAD_REQUEST')=>Object.assign(new Error(message),{status,code});
