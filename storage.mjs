import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {config} from './config.mjs';
let writes=Promise.resolve();
export async function readState(name,fallback){
 if(!config.dataDir)return fallback;
 try{return JSON.parse(await readFile(path.join(config.dataDir,name+'.json'),'utf8'));}catch(error){if(error.code==='ENOENT')return fallback;throw error;}
}
export function writeState(name,data){
 if(!config.dataDir)return Promise.resolve();
 const payload=JSON.stringify(data);
 const next=writes.catch(()=>{}).then(async()=>{await mkdir(config.dataDir,{recursive:true});const file=path.join(config.dataDir,name+'.json');await writeFile(file+'.tmp',payload,{mode:0o600});await rename(file+'.tmp',file);});writes=next;return next;
}
export const flushState=()=>writes;
