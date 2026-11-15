import {createCipheriv,randomInt} from 'node:crypto';
import {isEndMarker} from './codecs.mjs';

const u32=(value)=>{const b=Buffer.alloc(4);b.writeUInt32LE(value>>>0);return b;};
function iot(cmd,sid,payload=Buffer.alloc(0)){
 const h=Buffer.alloc(32);Buffer.from('abbccdde','hex').copy(h);h.writeUInt32LE(cmd,4);h.writeUInt32BE(1,8);h.writeUInt32LE(sid,16);h.writeUInt32LE(payload.length,28);return Buffer.concat([h,payload]);
}
function api(cmd,ticket,payload){const h=Buffer.alloc(24);h.writeUInt32LE(0x4b503250);h.writeUInt32LE(1,4);h.writeUInt32LE(ticket,8);h.writeUInt32LE(cmd,12);h.writeUInt32LE(payload.length,20);return Buffer.concat([h,payload]);}
function encryptField(value){
 if(value.length>=32||!/^[\x00-\x7f]*$/.test(value))throw new Error('Cet export prend actuellement en charge les identifiants ASCII de moins de 32 caractères.');
 const field=Buffer.alloc(32);field.write(value,'ascii');
 const cipher=createCipheriv('aes-128-ecb',Buffer.from('~!JUAN*&Vision-='),null);cipher.setAutoPadding(false);return Buffer.concat([cipher.update(field),cipher.final()]);
}
function replayBody(action,channel,start,end,type){const b=Buffer.alloc(52);b.writeUInt32LE(action);if(channel>=0)b[8+Math.floor(channel/8)]|=1<<(channel%8);b.writeUInt32LE(type,24);b.writeUInt32LE(start,32);b.writeUInt32LE(end,36);return b;}
export function nearReplayEnd(firstTs,lastTs,start,end){
 return firstTs!==null&&lastTs!==null&&(lastTs>=end*1000-1000||(firstTs<1e12&&lastTs-firstTs>=(end-start)*1000-1000));
}

// Dedicated replay connection; never sends configuration or recording deletion commands.
export function captureReplay({username,password,channel,start,end,type,host='127.0.0.1',port=10000,signal,onFrame,onAudio=()=>{},onEvent=()=>{},mode='replay',stream=1,maxLiveSeconds=0}){
 return new Promise((resolve,reject)=>{
  let ws,closed=false,ticket=0,stage='socket',frames=0,bytes=0,lastMedia=0,startedAt=Date.now(),firstTs=null,lastTs=null,ping,pending=Buffer.alloc(0);
  const sid=randomInt(1,10001);
  const send=payload=>{if(ws.readyState!==WebSocket.OPEN)return;ws.send(Buffer.concat([Buffer.from('cefaeffe','hex'),u32(payload.length)]));ws.send(payload);};
  const command=(cmd,body)=>send(iot(19,sid,api(cmd,++ticket,body)));
  const finish=(error)=>{if(closed)return;closed=true;clearInterval(watch);clearInterval(ping);signal?.removeEventListener('abort',abort);if(ws?.readyState===WebSocket.OPEN){try{if(stage==='media'){if(mode==='live')command(30,Buffer.concat([u32(channel),u32(stream),u32(1)]));else command(40,replayBody(2,-1,0,0,0));}}catch{}ws.close();}else ws?.close();error?reject(error):resolve({frames,bytes,firstTs,lastTs});};
  const abort=()=>finish(new Error('Téléchargement annulé.'));
  const watch=setInterval(()=>{
   const now=Date.now();
   if(stage!=='media'&&now-startedAt>15000)finish(new Error('Le NVR ne répond pas à l’ouverture de la lecture.'));
   else if(stage==='media'&&frames===0&&now-startedAt>25000)finish(new Error('Aucune image reçue pour cet enregistrement.'));
   else if(frames>0&&now-lastMedia>10000)finish(mode==='replay'&&nearReplayEnd(firstTs,lastTs,start,end)?undefined:new Error('Le flux s’est interrompu avant la fin. Essaie un extrait plus court.'));
   else if(mode==='live'&&maxLiveSeconds&&frames>0&&now-startedAt>=maxLiveSeconds*1000)finish();
   else if(mode==='replay'&&now-startedAt>Math.min(3630000,Math.max(60000,(end-start+30)*1000)))finish(new Error('Le téléchargement a dépassé le délai autorisé.'));
  },500);
  try{
   const auth=Buffer.concat([encryptField(username),encryptField(password)]);
   ws=new WebSocket(`ws://${host}:${port}`);ws.binaryType='arraybuffer';
   signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)return abort();
   ws.addEventListener('open',()=>{ws.send(Buffer.concat([Buffer.from('d9ffcc028c38eed2d199ac6026947fae','hex'),u32(sid)]));stage='handshake';});
   ws.addEventListener('error',()=>finish(new Error('Connexion vidéo au NVR impossible sur le port 10000.')));
   ws.addEventListener('close',()=>{if(!closed)finish(mode==='replay'&&frames>0&&nearReplayEnd(firstTs,lastTs,start,end)?undefined:new Error('Le NVR a fermé la connexion vidéo avant la fin.'));});
   ws.addEventListener('message',event=>{
    try{
     let data=Buffer.from(event.data);
     if(data.length>=4&&data.subarray(0,4).equals(Buffer.from('cefaeffe','hex')))return;
     if(stage==='handshake'){
      if(data.length<16||!data.subarray(0,16).equals(Buffer.from('96d5390d12fcbe8f4790d932ccd849f3','hex')))return finish(new Error('Réponse inattendue du transport vidéo.'));
      stage='iot';send(iot(20,sid,Buffer.concat([u32(sid),u32(0)])));return;
     }
     if(data.length<32||!data.subarray(0,4).equals(Buffer.from('abbccdde','hex')))return;
     const cmd=data.readUInt32LE(4),code=data.readInt32LE(24);onEvent({layer:'iot',cmd,code,size:data.length});
     if(cmd===21){if(code!==0)return finish(new Error('Ouverture vidéo refusée par le NVR.'));stage='auth';command(10,auth);ping=setInterval(()=>send(iot(17,sid,Buffer.alloc(96))),10000);return;}
     if(cmd!==19&&cmd!==43)return;
     data=data.subarray(32);if(pending.length){data=Buffer.concat([pending,data]);pending=Buffer.alloc(0);}if(data.length<4)return;
     let magic=data.readUInt32LE(0);
     if(magic===0x4b503250){if(data.length<24)return;const appCmd=data.readUInt32LE(12),result=data.readInt32LE(16);onEvent({layer:'api',cmd:appCmd,code:result,size:data.length});
      if(appCmd===11){if(result!==0)return finish(new Error('Authentification vidéo refusée par le NVR.'));stage='media';startedAt=Date.now();if(mode==='live')command(30,Buffer.concat([u32(channel),u32(stream),u32(2)]));else command(40,replayBody(3,channel,start,end,type));}
      else if(appCmd===31&&result!==0)finish(new Error('Le NVR refuse l’ouverture de cette caméra.'));
      else if(appCmd===41&&result!==0)finish(new Error('Le NVR refuse la lecture de cet enregistrement.'));
      return;
     }
     if(magic===0x4652414e){if(data.length<44)return;data=data.subarray(40);magic=data.readUInt32LE(0);}
     if(magic!==0x4652414d||data.length<64)return;
     const headType=data.readUInt32LE(8);if(headType!==(mode==='live'?0:1))return;
     onEvent({layer:'frame',size:data.length,declared:data.readUInt32LE(12),type:data.readUInt32LE(24)});
     const expected=64+data.readUInt32LE(12);if(expected>16*1024*1024)throw new Error('Image vidéo trop volumineuse.');
     if(data.length<expected){pending=data;return;}data=data.subarray(0,expected);
     const ts=Number(data.readBigUInt64LE(16));const frameType=data.readUInt32LE(24),frameChannel=data.readUInt32LE(28);
     if(frameChannel!==channel)return;
     const param=mode==='live'?32:40;
     const codec=data.subarray(param,param+8).toString('ascii').replace(/\0.*$/,'');
     if(frameType===0){onAudio({codec,sampleRate:data.readUInt32LE(param+8),sampleWidth:data.readUInt32LE(param+12),channels:data.readUInt32LE(param+16),time:ts,data:data.subarray(64)});return;}
     if(![1,2].includes(frameType))return;
     const frame={codec,fps:data.readUInt32LE(param+8),width:data.readUInt32LE(param+12),height:data.readUInt32LE(param+16),time:ts,key:frameType===1,data:data.subarray(64)};
     if(!frame.data.length)return;
     if(isEndMarker(frame.codec,frame.data))return;
     if(firstTs===null)firstTs=ts;lastTs=ts;lastMedia=Date.now();
     onFrame(frame);frames++;bytes+=frame.data.length;
     onEvent({layer:'progress',elapsed:ts-firstTs,frames,bytes});
     if(mode==='replay'&&bytes>1024*1024*1024)return finish(new Error('Extrait trop volumineux : limite de 1 Go.'));
     if(mode==='replay'&&(ts>=end*1000||(ts<1e12&&ts-firstTs>=(end-start)*1000)))finish();
    }catch(err){finish(err instanceof Error?err:new Error('Erreur de décodage vidéo.'));}
   });
  }catch(err){finish(err);}
 });
}
