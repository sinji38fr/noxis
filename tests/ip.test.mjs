import test from 'node:test';
import assert from 'node:assert/strict';
import ip from '../vendor/ip/index.cjs';
test('FTP data peers match canonical and IPv4-mapped addresses, unrelated peers are rejected',()=>{assert.equal(ip.isEqual('127.0.0.1','::ffff:127.0.0.1'),true);assert.equal(ip.isEqual('::1','0:0:0:0:0:0:0:1'),true);assert.equal(ip.isEqual('192.0.2.1','192.0.2.2'),false);assert.equal(ip.isEqual('example.com','127.0.0.1'),false);assert.equal(ip.isEqual('127.1','127.0.0.1'),false);});
