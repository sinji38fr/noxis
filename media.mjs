import {config} from './config.mjs';
import {spawn} from 'node:child_process';
import {existsSync,openSync,writeSync,closeSync} from 'node:fs';
import {mkdtemp,unlink,rmdir,readFile,mkdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url));
export const ffmpeg=process.env.FFMPEG_PATH||(existsSync(path.join(directory,'.tools','ffmpeg.exe'))?path.join(directory,'.tools','ffmpeg.exe'):'ffmpeg');
export function runFFmpeg(args,{signal}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(ffmpeg,['-hide_banner','-loglevel','error','-nostdin',...args],{windowsHide:true,stdio:['ignore','ignore','pipe']});let errors='';
  child.stderr.on('data',b=>{errors=(errors+b).slice(-2000);});
  const abort=()=>child.kill();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  child.on('error',()=>{signal?.removeEventListener('abort',abort);reject(new Error('Moteur vidéo FFmpeg indisponible.'));});
  child.on('close',code=>{signal?.removeEventListener('abort',abort);if(signal?.aborted)return reject(new Error('Opération annulée.'));if(code!==0)return reject(new Error('Le moteur vidéo ne peut pas assembler cet enregistrement.'));resolve();});
 });
}
export async function exportArchive(reader,options,{browser=false,signal}={}){
 const cache=config.dataDir?path.join(config.dataDir,'media'):os.tmpdir();await mkdir(cache,{recursive:true});const folder=await mkdtemp(path.join(cache,'noxis-'));
 const videoPath=path.join(folder,'video.raw'),audioPath=path.join(folder,'audio.raw'),output=path.join(folder,'archive.mp4');
 let vfd,afd,codec=null,audioCodec=null,frames=0,firstTime=null,lastTime=null,audioBytes=0,audioFirst=null,reportedFps=25;
 try{
  vfd=openSync(videoPath,'w');afd=openSync(audioPath,'w');
  const stats=await reader({...options,signal,onFrame:frame=>{
   if(!codec){if(!frame.key||frame.time<(options.start||0)*1000)return;if(!['H264','H265'].includes(frame.codec))throw new Error('Codec vidéo non pris en charge.');codec=frame.codec;reportedFps=frame.fps||25;firstTime=frame.time;}
   if(frame.codec!==codec)throw new Error('Le codec change dans cette plage. Choisis un extrait plus court.');
   writeSync(vfd,frame.data);frames++;lastTime=frame.time;
  },onAudio:frame=>{
   if(firstTime===null||!frame.data.length)return;
   if(!['G711A','G711U'].includes(frame.codec)||frame.channels!==1||frame.sampleRate!==8000)throw new Error('Codec audio non pris en charge.');
   if(audioCodec&&audioCodec!==frame.codec)throw new Error('Le format audio change dans cette plage.');
   audioCodec=frame.codec;if(audioFirst===null)audioFirst=frame.time;writeSync(afd,frame.data);audioBytes+=frame.data.length;
  }});
  closeSync(vfd);vfd=null;closeSync(afd);afd=null;
  if(!frames)throw new Error('Aucune image complète reçue dans cet enregistrement.');
  const fps=frames>1&&lastTime>firstTime?(frames-1)*1000/(lastTime-firstTime):reportedFps;
  const args=['-y','-fflags','+genpts','-framerate',String(Math.max(1,Math.min(120,fps))),'-f',codec==='H265'?'hevc':'h264','-i',videoPath];
  if(audioBytes)args.push('-itsoffset',String(Math.max(-5,Math.min(5,(audioFirst-firstTime)/1000))),'-f',audioCodec==='G711A'?'alaw':'mulaw','-ar','8000','-ac','1','-i',audioPath);
  args.push('-map','0:v:0');if(audioBytes)args.push('-map','1:a:0');
  if(browser&&codec==='H265')args.push('-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p');else args.push('-c:v','copy');
  if(codec==='H265'&&!browser)args.push('-tag:v','hvc1');
  if(audioBytes)args.push('-c:a','aac','-b:a','64k');
  args.push('-movflags','+faststart',output);
  options.onAssembling?.();await runFFmpeg(args,{signal});await unlink(videoPath).catch(()=>{});await unlink(audioPath).catch(()=>{});
  return {file:output,codec,browser,hasAudio:audioBytes>0,stats,dispose:async()=>{for(const file of [videoPath,audioPath,output])await unlink(file).catch(()=>{});await rmdir(folder).catch(()=>{});}};
 }catch(error){if(vfd!==null&&vfd!==undefined)closeSync(vfd);if(afd!==null&&afd!==undefined)closeSync(afd);for(const file of [videoPath,audioPath,output])await unlink(file).catch(()=>{});await rmdir(folder).catch(()=>{});throw error;}
}
export async function configuredCredentials(){
 const username=process.env.NVR_USERNAME||'';
 const password=process.env.NVR_PASSWORD_FILE?(await readFile(process.env.NVR_PASSWORD_FILE,'utf8')).replace(/[\r\n]+$/,''):(process.env.NVR_PASSWORD||'');
 return {username,password,configured:!!username&&!!(process.env.NVR_PASSWORD_FILE||process.env.NVR_PASSWORD)};
}
export function streamLive(reader,options,res,{signal}={}){
 let decoder,bytes=0;const stop=()=>decoder?.kill();signal?.addEventListener('abort',stop,{once:true});
 return reader({...options,mode:'live',signal,onFrame:frame=>{
  if(!decoder){if(!frame.key)return;if(!['H264','H265'].includes(frame.codec))throw new Error('Codec direct non pris en charge.');
   decoder=spawn(ffmpeg,['-hide_banner','-loglevel','error','-nostdin','-fflags','nobuffer','-flags','low_delay','-probesize','32768','-analyzeduration','0','-f',frame.codec==='H265'?'hevc':'h264','-i','pipe:0','-an','-vf','fps=5,scale=960:-2','-q:v','5','-f','image2pipe','-vcodec','mjpeg','pipe:1'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
   decoder.on('error',()=>res.destroy());decoder.stdin.on('error',()=>{});decoder.stderr.resume();
   decoder.stdout.on('data',chunk=>{bytes+=chunk.length;if(!res.destroyed){if(!res.write(chunk))decoder.stdout.pause();}});res.on('drain',()=>decoder?.stdout.resume());
  }
  if(decoder.stdin.writableLength>8*1024*1024)throw new Error('Le décodage ne suit pas le flux. Utilise le flux secondaire.');
  decoder.stdin.write(frame.data);
 }}).then(stats=>({...stats,jpegBytes:bytes})).finally(()=>{signal?.removeEventListener('abort',stop);stop();});
}
