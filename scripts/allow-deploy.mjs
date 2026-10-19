import {allowProduction} from './release-policy.mjs';
const allowed = allowProduction({
  repo: `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`,
  branch: process.env.VERCEL_GIT_COMMIT_REF,
  environment: process.env.VERCEL_ENV,
});
console.log(allowed ? 'Sara: build this deployment.' : 'Sara: development commit; production requires sara-stable.');
// Vercel's Ignored Build Step uses 0 to skip and 1 to build.
process.exit(allowed ? 1 : 0);
