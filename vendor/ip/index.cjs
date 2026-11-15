const {BlockList,isIP}=require('node:net');
exports.isEqual=(first,second)=>{
 if(typeof first!=='string'||typeof second!=='string'||!isIP(first)||!isIP(second))return false;
 try{const peers=new BlockList();peers.addAddress(first,isIP(first)===6?'ipv6':'ipv4');return peers.check(second,isIP(second)===6?'ipv6':'ipv4');}catch{return false;}
};
