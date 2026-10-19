import {readFile} from 'node:fs/promises';
import {UPSTREAM, validateRelease} from './release-policy.mjs';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const marker = JSON.parse(await readFile('sara-release.json', 'utf8'));
if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY.toLowerCase() !== UPSTREAM.toLowerCase()) {
  throw Error('Only the public Sara source repository can publish official releases.');
}
const version = process.argv[2] || pkg.version;
validateRelease(pkg, marker, `sara-v${version}`);
for (const [file, expected] of [['public/app.js', `const VERSION = '${version}'`], ['public/sw.js', `vesper-shell-${version}`]]) {
  if (!(await readFile(file, 'utf8')).includes(expected)) throw Error(`Version mismatch in ${file}`);
}
console.log(`Sara release validated: sara-v${version}`);
