import { start } from './web.mjs';
start().catch(() => { console.error('Noxis startup failed. Check configuration.'); process.exitCode = 1; });
