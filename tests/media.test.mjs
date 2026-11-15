import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,unlink,rmdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {ffmpeg,runFFmpeg,exportArchive} from '../media.mjs';
test('H265 archive exports to an MP4 with AAC audio and can be decoded',async()=>{
 const folder=await mkdtemp(path.join(os.tmpdir(),'noxis-test-')),raw=path.join(folder,'synthetic.hevc');let output;
 try{
  await runFFmpeg(['-y','-f','lavfi','-i','color=c=blue:s=128x96:r=10:d=1','-c:v','libx265','-x265-params','log-level=error','-f','hevc',raw]);const data=await readFile(raw);
  const reader=async o=>{o.onFrame({codec:'H265',key:true,fps:10,width:128,height:96,time:1000,data});o.onAudio({codec:'G711A',sampleRate:8000,channels:1,time:1000,data:Buffer.alloc(8000,0xd5)});return {frames:10};};
  output=await exportArchive(reader,{});const file=await readFile(output.file);assert.equal(file.subarray(4,8).toString(),'ftyp');assert.equal(output.codec,'H265');assert.equal(output.hasAudio,true);
  const decode=spawnSync(ffmpeg,['-hide_banner','-v','error','-i',output.file,'-f','null','-'],{windowsHide:true,encoding:'utf8'});assert.equal(decode.status,0,decode.stderr);
  const info=spawnSync(ffmpeg,['-hide_banner','-i',output.file],{windowsHide:true,encoding:'utf8'});assert.match(info.stderr,/Video: hevc/);assert.match(info.stderr,/Audio: aac/);
 }finally{await output?.dispose();await unlink(raw).catch(()=>{});await rmdir(folder).catch(()=>{});}
});
