import {isIP} from 'node:net';

function hostname(value){
 if(typeof value!=='string'||!value||/[\s/@\\?#]/.test(value))return '';
 try{return new URL('http://'+value).hostname.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');}catch{return '';}
}

export function hostAllowed(value,allowedHosts,publicHost=''){
 const host=hostname(value);if(!host)return false;
 if(publicHost&&host===hostname(publicHost))return true;
 return allowedHosts.some(rule=>{
  const pattern=rule.trim().toLowerCase();
  if(pattern==='*')return true;
  if(pattern.endsWith('.*')){
   const prefix=pattern.slice(0,-1),parts=prefix.slice(0,-1).split('.');
   return parts.length>=1&&parts.length<=3&&parts.every(part=>/^\d{1,3}$/.test(part)&&Number(part)<=255&&String(Number(part))===part)&&isIP(host)===4&&host.startsWith(prefix);
  }
  return host===hostname(pattern);
 });
}
