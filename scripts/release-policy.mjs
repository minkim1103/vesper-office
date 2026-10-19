export const UPSTREAM = 'minkim1103/vesper-office';
export const STABLE_BRANCH = 'sara-stable';
export const TAG = /^sara-v(\d+\.\d+\.\d+)$/;

export function compareVersions(a, b) {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
}

export function selectRelease(releases) {
  return releases.filter(r => !r.draft && !r.prerelease && TAG.test(r.tag_name))
    .sort((a, b) => compareVersions(b.tag_name.slice(6), a.tag_name.slice(6)))[0] || null;
}

export function validateRelease(pkg, marker, tag) {
  const match = TAG.exec(tag);
  if (!match || marker?.product !== 'sara' || marker.channel !== 'stable'
      || marker.upstream !== UPSTREAM || pkg.name !== '@vesper/core'
      || pkg.version !== match[1] || marker.version !== pkg.version) {
    throw Error('Only a matching public Sara stable release can be installed.');
  }
}

// Workflow files and installation-specific files are deliberately never replaced.
export function managedPath(path) {
  if (path.split('/').some(part => part === '..' || !part) || path.includes('\\')) return false;
  return /^(api|src|public|scripts|test|docs)\//.test(path)
    || ['README.md', 'SETUP_GUIDE.md', 'package.json', 'vercel.json', '.env.example', '.gitignore', 'sara-release.json'].includes(path);
}

export function allowProduction({repo, branch, environment}) {
  return environment !== 'production' || repo?.toLowerCase() !== UPSTREAM.toLowerCase() || branch === STABLE_BRANCH;
}
