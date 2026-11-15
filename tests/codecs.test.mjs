import test from 'node:test';
import assert from 'node:assert/strict';
import {isEndMarker,annexBNals} from '../codecs.mjs';
import {nearReplayEnd} from '../replay.mjs';
test('the legacy H264 EOS placeholder inside an H265 archive is not a codec change',()=>{const marker=Buffer.from('000000010b000001','hex');assert.equal(annexBNals(marker).length,1);assert.equal(isEndMarker('H264',marker),true);assert.equal(isEndMarker('H264',Buffer.from('000000016588840001','hex')),false);assert.equal(isEndMarker('H265',Buffer.from('0000000140010c01','hex')),false);});
test('absolute timestamps do not complete an archive early because of GOP preroll',()=>{const start=1760000000,end=start+625;assert.equal(nearReplayEnd((start-17)*1000,(end-17)*1000,start,end),false);assert.equal(nearReplayEnd((start-17)*1000,end*1000-100,start,end),true);});
