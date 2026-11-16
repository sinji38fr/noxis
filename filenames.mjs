const pad=value=>String(value).padStart(2,'0');
const date=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const time=d=>`${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
export function archiveFilename({channel,start,end},suffix=''){
 const first=new Date(start*1000),last=new Date(end*1000);
 return `Cam${pad(channel)}_${date(first)}_${time(first)}_${date(first)===date(last)?'':date(last)+'_'}${time(last)}${suffix}.mp4`;
}
