import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveFilename} from '../filenames.mjs';
import {config} from '../config.mjs';
import {ExportManager} from '../jobs.mjs';
test('archive names show local dates and include the end date across midnight',()=>{
 const start=new Date(2026,9,31,19,0,0).getTime()/1000;
 assert.equal(archiveFilename({channel:2,start,end:start+625}),'Cam02_2026-10-31_19-00-00_19-10-25.mp4');
 const late=new Date(2026,9,31,23,59,0).getTime()/1000;
 assert.equal(archiveFilename({channel:2,start:late,end:late+120}),'Cam02_2026-10-31_23-59-00_2026-11-01_00-01-00.mp4');
});
test('export manager applies the configured limit, defaulting to one',async()=>{
 const manager=new ExportManager();
 try{assert.equal(manager.concurrent,config.exportConcurrency);if(!process.env.EXPORT_CONCURRENCY)assert.equal(manager.concurrent,1);}finally{await manager.close();}
});
