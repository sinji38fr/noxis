export function annexBNals(input){
 const data=Buffer.from(input),starts=[];
 for(let i=0;i+2<data.length;i++){if(data[i]!==0||data[i+1]!==0)continue;if(data[i+2]===1){starts.push([i,i+3]);i+=2;}else if(i+3<data.length&&data[i+2]===0&&data[i+3]===1){starts.push([i,i+4]);i+=3;}}
 return starts.map(([_,start],i)=>data.subarray(start,i+1<starts.length?starts[i+1][0]:data.length)).filter(n=>n.length);
}
export function isEndMarker(codec,data){
 if(data.length>64)return false;const nals=annexBNals(data);if(!nals.length)return false;
 if(codec==='H264'){const types=nals.map(n=>n[0]&31);return types.some(t=>t===10||t===11)&&types.every(t=>[9,10,11,12].includes(t));}
 if(codec==='H265'){const types=nals.map(n=>(n[0]>>1)&63);return types.some(t=>t===36||t===37)&&types.every(t=>[35,36,37,38].includes(t));}
 return false;
}
