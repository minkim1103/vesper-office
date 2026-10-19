// Tests always run with isolated demo credentials, even during a production build.
import {spawnSync} from 'node:child_process';
const env={...process.env,TIMEZONE:'Asia/Seoul'};
for(const key of ['ICLOUD_USERNAME','ICLOUD_APP_PASSWORD','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN','APP_PASSWORD','MCP_TOKEN','SESSION_SECRET','VESPER_CALENDAR','CALDAV_URL']) env[key]='';
for(const name of process.argv.slice(2)) {
  if(!/^[a-z-]+$/.test(name)) throw Error('Invalid test suite');
  const result=spawnSync(process.execPath,[`test/${name}.js`],{cwd:process.cwd(),env,stdio:'inherit'});
  if(result.status!==0) process.exit(result.status||1);
}
