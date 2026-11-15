import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const image=process.argv[2]||'shinji38fr/noxis';if(!/^[a-z0-9][a-z0-9_.-]*\/[a-z0-9][a-z0-9_.-]*$/.test(image))throw new Error('Use namespace/repository');
const version=(await readFile(new URL('../VERSION',import.meta.url),'utf8')).trim();if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Invalid VERSION');
const run=args=>{const r=spawnSync('docker',args,{stdio:'inherit',windowsHide:true});if(r.status!==0)process.exit(r.status||1);};
run(['build','-t',`${image}:${version}`,'-t',`${image}:latest`,'.']);run(['push',`${image}:${version}`]);run(['push',`${image}:latest`]);
