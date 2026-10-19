import {execFileSync} from 'node:child_process';
import {readFile, writeFile, appendFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {UPSTREAM, TAG, compareVersions, selectRelease, validateRelease, managedPath} from './release-policy.mjs';

function git(cwd, ...args) { return execFileSync('git', args, {cwd, encoding:'utf8', maxBuffer:16 * 1024 * 1024}).trim(); }
function files(cwd, ref) { return git(cwd, 'ls-tree', '-r', '--name-only', ref).split('\n').filter(Boolean); }

export function applySnapshot(cwd, commit, tag) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('Invalid release commit.');
  if (git(cwd, 'status', '--porcelain')) throw Error('Repository must be clean before updating.');
  const sourcePkg = JSON.parse(git(cwd, 'show', `${commit}:package.json`));
  const marker = JSON.parse(git(cwd, 'show', `${commit}:sara-release.json`));
  validateRelease(sourcePkg, marker, tag);
  const sourceFiles = files(cwd, commit).filter(managedPath);
  const sourceSet = new Set(sourceFiles);
  const obsolete = files(cwd, 'HEAD').filter(p => managedPath(p) && !sourceSet.has(p));
  for (let i = 0; i < obsolete.length; i += 100) git(cwd, 'rm', '--', ...obsolete.slice(i, i + 100));
  for (let i = 0; i < sourceFiles.length; i += 100) git(cwd, 'restore', '--source', commit, '--staged', '--worktree', '--', ...sourceFiles.slice(i, i + 100));
  return {tag, commit, version:sourcePkg.version};
}

export async function triggerDeployment(hook, fetcher = fetch) {
  const url = new URL(hook);
  if (url.origin !== 'https://api.vercel.com' || !url.pathname.startsWith('/v1/integrations/deploy/')) {
    throw Error('Use a Vercel Deploy Hook URL from this project.');
  }
  const response = await fetcher(url, {method:'POST', redirect:'error', signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw Error(`Vercel rejected deployment (${response.status}); run the updater again to retry.`);
  const data = await response.json();
  if (!data.job?.id) throw Error('Vercel did not confirm a deployment job.');
  console.log('Vercel accepted the deployment request. Check Ready status in Vercel.');
}

async function officialReleases() {
  const releases = [];
  for (let page = 1; page <= 10; page++) {
    // Never forward the installation's GitHub token to the upstream repository.
    const response = await fetch(`https://api.github.com/repos/${UPSTREAM}/releases?per_page=100&page=${page}`, {
      headers:{Accept:'application/vnd.github+json'}, signal:AbortSignal.timeout(30000),
    });
    if (!response.ok) throw Error(`Could not check public Sara releases (${response.status}).`);
    const batch = await response.json(); releases.push(...batch);
    if (batch.length < 100) return releases;
  }
  throw Error('Too many releases to select safely. Update the bootstrap workflow.');
}

export async function update() {
  if (process.env.GITHUB_REPOSITORY?.toLowerCase() === UPSTREAM.toLowerCase()) {
    console.log('The official source publishes releases; it does not self-update.'); return;
  }
  const hook = process.env.SARA_DEPLOY_HOOK;
  if (!hook) throw Error('Set the SARA_DEPLOY_HOOK repository secret before enabling automatic updates.');
  // Validate before touching the repository; do not print this secret.
  const hookUrl = new URL(hook);
  if (hookUrl.origin !== 'https://api.vercel.com' || !hookUrl.pathname.startsWith('/v1/integrations/deploy/')) throw Error('Invalid Vercel Deploy Hook URL.');
  const cwd = process.cwd();
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  const localMarker = JSON.parse(await readFile('sara-release.json', 'utf8'));
  validateRelease(pkg, localMarker, `sara-v${pkg.version}`);
  const release = selectRelease(await officialReleases());
  if (!release) { console.log('No official Sara stable release found.'); return; }
  const version = TAG.exec(release.tag_name)[1];
  if (compareVersions(version, pkg.version) < 0) { console.log('No automatic downgrade.'); return; }
  // Retry a previous failed hook even if the code commit was already pushed.
  let previous = null;
  try { previous = JSON.parse(await readFile('.sara-update-state.json', 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const pending = process.env.SARA_DEPLOYED_COMMIT;
  if (version === pkg.version && previous?.tag === release.tag_name && pending === previous.commit) {
    console.log(`${release.tag_name} is already installed and deployment was requested.`); return;
  }
  // Explicit public URL: never fetch private Vesper or arbitrary repositories.
  git(cwd, 'fetch', '--no-tags', `https://github.com/${UPSTREAM}.git`, `refs/tags/${release.tag_name}`);
  const commit = git(cwd, 'rev-parse', 'FETCH_HEAD^{commit}');
  if (previous?.tag === release.tag_name && previous.commit !== commit) throw Error('An installed release tag moved; refusing it.');
  const state = applySnapshot(cwd, commit, release.tag_name);
  // Tests use demo credentials, never the user's cloud account.
  execFileSync(process.execPath, ['scripts/check-release.mjs', version], {cwd, stdio:'inherit', env:{...process.env, GITHUB_REPOSITORY:UPSTREAM}});
  execFileSync(process.execPath, ['scripts/test.mjs', 'run','google','spaces','workstream','assistant','briefing-style','search','paging','fonts','package','release'], {cwd, stdio:'inherit'});
  await writeFile('.sara-update-state.json', JSON.stringify(state, null, 2) + '\n');
  git(cwd, 'add', '--', '.sara-update-state.json');
  if (git(cwd, 'diff', '--cached', '--name-only')) {
    git(cwd, '-c','user.name=github-actions[bot]', '-c','user.email=41898282+github-actions[bot]@users.noreply.github.com', 'commit', '-m', `Update Sara to ${release.tag_name}`);
    // An ordinary push rejects concurrent user edits; never force-push.
    git(cwd, 'push', 'origin', `HEAD:${process.env.SARA_INSTALL_BRANCH || 'main'}`);
  }
  await triggerDeployment(hook);
  // Persisted by a separate workflow step only after Vercel accepts the request.
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `deployed_commit=${commit}\n`);
  console.log(`Installed ${release.tag_name}. User credentials and iCloud data were not changed.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  update().catch(error => { console.error(error.message); process.exitCode = 1; });
}
