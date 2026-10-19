import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { pathToFileURL } from 'node:url';
const directory=await mkdtemp(resolve('.sites-runtime','regression-'));
const password='test-only-browser-regression-password';
const server=spawn(process.execPath,['standalone-dist/server.mjs'],{env:{...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:'18890',APP_BASE_URL:'http://127.0.0.1:18890',APP_ACCESS_PASSWORD:password,TURSO_DATABASE_URL:pathToFileURL(join(directory,'db.sqlite')).href,ALLOW_LOCAL_DB:'true',TURSO_AUTH_TOKEN:'',MODEL_API_KEY:''},stdio:['ignore','pipe','pipe']});
try {
  await new Promise((ready,reject)=>{const timer=setTimeout(()=>reject(Error('Server startup timeout')),15000);server.stdout.on('data',value=>{if(String(value).includes('listening')){clearTimeout(timer);ready();}});server.once('exit',code=>reject(Error('Server exited '+code)));});
  const child=spawn(process.execPath,['tests/browser.test.mjs'],{env:{...process.env,TEST_BASE_URL:'http://127.0.0.1:18890',TEST_ACCESS_PASSWORD:password},stdio:'inherit'});
  const code=await new Promise(done=>child.once('exit',done)); if(code)process.exitCode=code;
} finally {server.kill();}
