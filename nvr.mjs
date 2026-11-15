import {randomBytes,createHash} from 'node:crypto';
import {config,failure,virtualDates} from './config.mjs';
export class NvrClient{
 constructor(username,password,{target=`http://${config.host}:${config.httpPort}`}={}){this.username=username;this.password=password;this.target=target;this.auth='Basic '+Buffer.from(username+':'+password).toString('base64');this.uid=randomBytes(16).toString('hex');this.records=new Map();this.days=new Map();this.cookie='';}
 async request(endpoint,payload,authenticate=true){
  let response;try{response=await fetch(this.target+endpoint,{method:payload?'POST':'GET',headers:{...(authenticate?{Authorization:this.auth}:{}),...(this.cookie?{Cookie:this.cookie}:{}),...(payload?{'Content-Type':'application/json'}:{})},body:payload?JSON.stringify(payload):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});}catch{throw failure('NVR unreachable.',502,'NVR_UNREACHABLE');}
  if([401,403].includes(response.status))throw failure('NVR access denied.',401,'NVR_AUTH');if(!response.ok)throw failure('Unexpected NVR HTTP response.',502,'NVR_RESPONSE');
  const cookies=response.headers.getSetCookie?.()||[];if(cookies.length)this.cookie=cookies.map(s=>s.split(';')[0]).join('; ');
  try{return await response.json();}catch{throw failure('Invalid NVR response.',502,'NVR_RESPONSE');}
 }
 async login(){const data=await this.request('/login',{DEV:'XVR',VER:'1.0',Parameter:{username:this.username,passwd:this.password}},false);if(data.status_code!=='ok'||data.status_resson!=='Login success!')throw failure('NVR login failed. Check credentials.',401,'NVR_AUTH');return this;}
 async search(query){
  if(!virtualDates().includes(query.Date))throw failure('Date outside configured archive history.',400,'DATE_RANGE');
  const data=await this.request('/netsdk/R.SearchRecord',{DEV:'XVR',VER:'1.0',API:'R.SearchRecord',Parameter:query});
  if(data.RetDetail!=='Search Success!')throw failure('NVR search failed.',502,'NVR_SEARCH');
  const rows=(Array.isArray(data.Item)?data.Item:[]).map(item=>{
   const record={channel:Number(item.Channel)+1,type:Number(item.Type),start:Number(item.TimeStart),end:Number(item.TimeEnd),sourceSize:Number(item.TotalSize)||0};
   if(!Number.isInteger(record.channel)||record.channel<1||record.channel>64||!Number.isInteger(record.start)||!Number.isInteger(record.end)||record.end<=record.start)return null;
   record.id=createHash('sha256').update(JSON.stringify([record.channel,record.type,record.start,record.end])).digest('hex').slice(0,24);this.records.set(record.id,record);return record;
  }).filter(Boolean);
  return {rows,total:Number(data.SearchCnt)||rows.length,page:query.CurrentPage,pageSize:query.PageSize};
 }
 async day(date){
  if(!virtualDates().includes(date))throw failure('Date outside configured archive history.',400,'DATE_RANGE');
  const cached=this.days.get(date);if(cached&&cached.expires>Date.now())return cached.rows;
  const rows=[];for(let page=1;page<=100;page++){const data=await this.search({Channel:Array(config.channels).fill('True'),Type:['True','True','True','True'],Date:date,BeginTime:'00:00:00',EndTime:'23:59:59',PageSize:100,CurrentPage:page,Reload:'True'});rows.push(...data.rows);if(rows.length>=data.total||!data.rows.length)break;}
  this.days.set(date,{expires:Date.now()+60000,rows});return rows;
 }
 async info(){const [device,time]=await Promise.allSettled([this.request('/netsdk/Stat/DeviceInfo'),this.request('/netsdk/LocalTime')]);return {device:device.status==='fulfilled'?device.value:null,time:time.status==='fulfilled'?time.value:null,host:config.host,channels:config.channels,archiveDays:config.archiveDays};}
}
