import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
const root=await mkdtemp(join(tmpdir(),'vesper-package-'));
try {
 for(const entry of pkg.files) await cp(new URL('../'+entry,import.meta.url),join(root,entry),{recursive:true});
 await writeFile(join(root,'package.json'),JSON.stringify({type:'module'}));
 const result=spawnSync(process.execPath,['--input-type=module','-e',"await import('./src/handler.js'); console.log('package loads')"],{cwd:root,env:{...process.env,ICLOUD_USERNAME:'',ICLOUD_APP_PASSWORD:''},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.ok(!pkg.files.some(p=>p.startsWith('app/')));
 console.log('✓ Packaged core: isolated allowlisted installation imports full HTTP server without missing assets');
} finally {await rm(root,{recursive:true,force:true});}
