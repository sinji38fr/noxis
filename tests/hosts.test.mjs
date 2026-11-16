import test from 'node:test';
import assert from 'node:assert/strict';
import {hostAllowed} from '../hosts.mjs';

test('private IPv4 patterns only match complete addresses in the selected prefix',()=>{
 const rules=['localhost','127.0.0.1','192.168.*'];
 for(const host of ['localhost:8787','127.0.0.1','192.168.0.1:8787','192.168.255.254'])assert.equal(hostAllowed(host,rules),true,host);
 for(const host of ['192.169.1.1','10.1.2.3','192.168.attacker.example','192.168.1.1.evil.test','192.168.999.1','example.test'])assert.equal(hostAllowed(host,rules),false,host);
 assert.equal(hostAllowed('192.168.2.1',['192.168.1.*']),false);
 assert.equal(hostAllowed('192.168.1.99',['192.168.1.*']),true);
});
test('wildcard is explicit and invalid Host values stay rejected',()=>{
 assert.equal(hostAllowed('my-noxis.example:8787',['*']),true);
 assert.equal(hostAllowed('10.0.0.5',['*']),true);
 for(const host of ['','user@localhost','localhost/path','localhost\\path','bad host','localhost?x=1'])assert.equal(hostAllowed(host,['*']),false,host);
 assert.equal(hostAllowed('my-noxis.example',[]),false);
 assert.equal(hostAllowed('MY-NOXIS.EXAMPLE:443',[],'my-noxis.example'),true);
 assert.equal(hostAllowed('[::1]:8787',['[::1]']),true);
});
