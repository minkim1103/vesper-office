import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {UPSTREAM, selectRelease, validateRelease, managedPath, allowProduction} from '../scripts/release-policy.mjs';
import {applySnapshot, triggerDeployment} from '../scripts/update-sara.mjs';

const stable = {tag_name:'sara-v3.0.1', draft:false, prerelease:false};
assert.equal(selectRelease([
  stable, {tag_name:'v99.0.0'}, {tag_name:'vesper-v99.0.0'},
  {tag_name:'sara-v9.0.0', draft:true}, {tag_name:'sara-v8.0.0', prerelease:true},
  {tag_name:'sara-v4.0.0-beta'}, {tag_name:'sara-v3.0.0'},
]).tag_name, stable.tag_name);
assert.equal(selectRelease([{tag_name:'vesper-v99.0.0'}]), null);
assert.equal(selectRelease([stable, {tag_name:'sara-v3.0.10'}]).tag_name, 'sara-v3.0.10');
const pkg = {name:'@vesper/core', version:'3.0.1'};
const marker = {product:'sara', channel:'stable', upstream:UPSTREAM, version:pkg.version};
validateRelease(pkg, marker, stable.tag_name);
assert.throws(() => validateRelease({name:'vesper',version:'3.0.1'}, marker, stable.tag_name));
assert.throws(() => validateRelease(pkg, {...marker,upstream:'minkim1103/Vesper'}, stable.tag_name));
assert.throws(() => validateRelease(pkg, marker, 'sara-v3.0.2'));
for (const path of ['.github/workflows/sara-update.yml','.env','.env.local','.sara-update-state.json','app/profile.js','../src/secrets','src/../.env']) assert.equal(managedPath(path), false, path);
assert.equal(managedPath('public/app.js'), true);
assert.equal(allowProduction({repo:UPSTREAM,branch:'main',environment:'production'}), false);
assert.equal(allowProduction({repo:UPSTREAM,branch:'sara-stable',environment:'production'}), true);
assert.equal(allowProduction({repo:UPSTREAM,branch:'main',environment:'preview'}), true);
assert.equal(allowProduction({repo:'someone/sara',branch:'main',environment:'production'}), true);

const root = await mkdtemp(join(tmpdir(), 'sara-release-test-'));
const git = (...args) => execFileSync('git', args, {cwd:root, encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const put = async (path, data) => { await mkdir(join(root, path, '..'), {recursive:true}); await writeFile(join(root, path), data); };
try {
  git('init','-b','main'); git('config','user.name','Sara test'); git('config','user.email','test@example.invalid');
  await put('package.json', JSON.stringify({...pkg,version:'3.0.0'}));
  await put('public/app.js','old UI'); await put('public/removed.js','obsolete');
  await put('.github/workflows/sara-update.yml','installation bootstrap');
  await put('.env','synthetic installation secret'); await put('personal-config.json','keep me');
  git('add','.'); git('commit','-m','installation');
  git('checkout','-b','fixture-release');
  await put('package.json', JSON.stringify(pkg)); await put('sara-release.json',JSON.stringify(marker));
  await put('public/app.js','Sara new UI'); git('rm','public/removed.js');
  await put('.env','must never copy');
  await put('.github/workflows/sara-update.yml','must not replace workflow');
  git('add','.'); git('commit','-m','public fixture'); const commit = git('rev-parse','HEAD');
  git('checkout','main');
  assert.throws(() => applySnapshot(root, commit, 'sara-v9.0.0'));
  assert.equal(git('status','--porcelain'), '');
  const result = applySnapshot(root, commit, stable.tag_name);
  assert.equal(result.version, '3.0.1');
  assert.equal(await readFile(join(root,'public/app.js'),'utf8'), 'Sara new UI');
  assert.equal(await readFile(join(root,'.env'),'utf8'), 'synthetic installation secret');
  assert.equal(await readFile(join(root,'personal-config.json'),'utf8'), 'keep me');
  assert.equal(await readFile(join(root,'.github/workflows/sara-update.yml'),'utf8'), 'installation bootstrap');
  await assert.rejects(readFile(join(root,'public/removed.js')), {code:'ENOENT'});
  assert.throws(() => applySnapshot(root, commit, stable.tag_name), /clean/);
} finally { await rm(root, {recursive:true,force:true}); }

let called = false;
await assert.rejects(triggerDeployment('https://evil.example/hook', async () => {called=true;}));
assert.equal(called, false);
await assert.rejects(triggerDeployment('https://api.vercel.com/v1/integrations/deploy/test', async () => ({ok:false,status:503})), /503/);
await assert.rejects(triggerDeployment('https://api.vercel.com/v1/integrations/deploy/test', async () => ({ok:true,json:async()=>({})})), /confirm/);
await triggerDeployment('https://api.vercel.com/v1/integrations/deploy/test', async (url, options) => {
  assert.equal(options.method,'POST'); assert.equal(options.redirect,'error');
  return {ok:true,json:async()=>({job:{id:'synthetic-job'}})};
});
console.log('✓ Sara: public stable releases only; snapshots preserve installation secrets/workflows; production gate and hook failures verified');
