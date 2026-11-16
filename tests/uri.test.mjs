import test from 'node:test';
import assert from 'node:assert/strict';
import {deploymentUri} from '../config.mjs';
import {createApp,exportsManager} from '../web.mjs';
import {NvrClient} from '../nvr.mjs';
test('public URI and base prefix normalize safely and reject ambiguous paths',()=>{
 assert.equal(deploymentUri('','https://home.example/noxis/').basePath,'/noxis');assert.equal(deploymentUri('/noxis','https://home.example').publicUrl,'https://home.example/noxis/');assert.throws(()=>deploymentUri('/a/../b'));assert.throws(()=>deploymentUri('/a','https://home.example/b'));assert.throws(()=>deploymentUri('','https://user:secret@home.example/noxis'));
});
test('prefixed resources, API, public origin and session cookie work behind a proxy',async()=>{
 const original=NvrClient.prototype.login;NvrClient.prototype.login=async function(){return this;};const app=createApp({basePath:'/noxis',publicUrl:'https://home.example/noxis/'});await new Promise(r=>app.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.address().port}`;
 try{assert.equal((await fetch(base+'/healthz')).status,404);assert.equal((await fetch(base+'/noxis/healthz')).status,200);const redirect=await fetch(base+'/noxis',{redirect:'manual'});assert.equal(redirect.status,308);assert.equal(redirect.headers.get('location'),'/noxis/');const html=await(await fetch(base+'/noxis/')).text();assert.match(html,/name="noxis-base" content="\/noxis"/);assert.match(html,/src="\/noxis\/app.js"/);assert.match(html,/href="\/noxis\/style.css"/);assert.equal((await fetch(base+'/noxis/app.js')).status,200);
 const login=await fetch(base+'/noxis/api/session',{method:'POST',headers:{Origin:'https://home.example','Content-Type':'application/json','X-Noxis-Client':'1'},body:JSON.stringify({username:'synthetic',password:'synthetic'})});assert.equal(login.status,200);const set=login.headers.get('set-cookie');assert.match(set,/Path=\/noxis/);assert.match(set,/Secure/);const cookie=set.split(';')[0];assert.equal((await fetch(base+'/noxis/api/session',{headers:{Cookie:cookie}})).status,200);
 const rejected=await fetch(base+'/noxis/api/logout',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json','X-Noxis-Client':'1',Cookie:cookie},body:'{}'});assert.equal(rejected.status,403);
 const logout=await fetch(base+'/noxis/api/logout',{method:'POST',headers:{Origin:'https://home.example','Content-Type':'application/json','X-Noxis-Client':'1',Cookie:cookie},body:'{}'});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Path=\/noxis/);
 }finally{NvrClient.prototype.login=original;await new Promise(r=>app.close(r));}
});
test.after(()=>exportsManager.close());
