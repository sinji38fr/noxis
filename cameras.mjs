import {config} from './config.mjs';
import {readState,writeState} from './storage.mjs';
let names;const initialize=async()=>{if(!names)names=await readState('cameras',{});};
export async function cameras(){await initialize();return Array.from({length:config.channels},(_,i)=>({id:String(i+1),channel:i+1,name:names[i+1]||`Camera ${i+1}`,capabilities:['snapshot','live_jpeg','recording_search','export']}));}
export async function renameCamera(channel,name){await initialize();names[channel]=name;await writeState('cameras',names);return (await cameras())[channel-1];}
