import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';

test('provider routing, credential isolation, persistence and access controls', async t => {
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const folder = await mkdtemp(path.join(tmpdir(), 'wenshu-provider-check-'));
  let child;
  async function stop() { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; } }
  t.after(async () => { await stop(); assert.ok(path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(folder).startsWith('wenshu-provider-check-')); await rm(folder, { recursive: true, force: true }); });
  await copyFile(path.join(root, 'server.mjs'), path.join(folder, 'server.mjs'));
  await copyFile(path.join(root, 'providers.js'), path.join(folder, 'providers.js'));
  await writeFile(path.join(folder, 'mock.mjs'), `
globalThis.fetch = async (url, options = {}) => {
  const target = new URL(url);
  if (!['api.openai.com', 'api.deepseek.com', 'dashscope.aliyuncs.com'].includes(target.hostname)) throw new Error('Unexpected provider');
  const auth = options.headers?.Authorization;
  if (auth !== 'Bearer test-key-' + target.hostname) return new Response('{}', {status:401});
  if (target.pathname.endsWith('/models')) return Response.json({data:[{id:target.hostname==='api.openai.com'?'gpt-test':'deepseek-test'},{id:'text-embedding-test'}]});
  const body = JSON.parse(options.body);
  if (target.pathname.endsWith('/responses')) {
    if (!body.input || body.messages) return new Response('{}', {status:400});
    return Response.json({output_text:target.hostname+target.pathname});
  }
  if (!body.messages || body.input) return new Response('{}', {status:400});
  return Response.json({choices:[{message:{content:target.hostname+target.pathname}}]});
};`);
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  async function start() {
    child = spawn(process.execPath, ['--import', './mock.mjs', 'server.mjs'], { cwd: folder, env: { ...process.env, WENSHU_PORT: String(port), WENSHU_HOST: '127.0.0.1', WENSHU_ACCESS_TOKEN: 'test-access', WENSHU_AI_API_KEY: '', WENSHU_AI_MODEL: '', WENSHU_AI_BASE_URL: '', WENSHU_AI_API_STYLE: 'responses' }, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => { const timeout=setTimeout(()=>reject(new Error('Server start timeout')),10000);child.stdout.once('data',()=>{clearTimeout(timeout);resolve();});child.once('error',error=>{clearTimeout(timeout);reject(error);});child.once('exit',()=>{clearTimeout(timeout);reject(new Error('Server exited early'));}); });
  }
  async function call(route, body, extras={}) {
    const response = await fetch(base+route, { method:body===undefined?'GET':'POST', headers:{'Content-Type':'application/json',Authorization:'Bearer test-access',Origin:base,...extras},body:body===undefined?undefined:JSON.stringify(body) });
    return {status:response.status,data:await response.json()};
  }
  await start();
  assert.equal((await call('/api/models',{provider:'__proto__',apiKey:'test-key-value'})).status,400);
  assert.equal((await call('/api/models',null)).status,400);
  assert.equal((await call('/api/models',{provider:'openai',apiKey:'test-key-api.openai.com'},{Authorization:''})).status,401);
  assert.equal((await call('/api/config',{provider:'openai',apiKey:'test-key-api.openai.com',model:'gpt-test'},{Origin:'https://unrelated.example'})).status,403);
  let result=await call('/api/models',{provider:'openai',apiKey:'test-key-api.openai.com'});
  assert.deepEqual(result.data.models,[{id:'gpt-test'}]);
  assert.equal((await call('/api/config',{provider:'openai',apiKey:'test-key-api.openai.com',model:'gpt-test'})).status,200);
  assert.equal((await call('/api/ai',{task:'outline',input:'Public sample',consent:true})).data.result,'api.openai.com/v1/responses');
  // An omitted key must never borrow a different provider's stored credential.
  assert.equal((await call('/api/models',{provider:'deepseek',apiKey:''})).status,400);
  assert.equal((await call('/api/config',{provider:'deepseek',apiKey:'',model:'deepseek-test'})).status,400);
  assert.equal((await call('/api/models',{provider:'deepseek',apiKey:'test-key-api.deepseek.com'})).data.models[0].id,'deepseek-test');
  assert.equal((await call('/api/config',{provider:'deepseek',apiKey:'test-key-api.deepseek.com',model:'deepseek-test'})).status,200);
  assert.equal((await call('/api/ai',{task:'outline',input:'Public sample',consent:true})).data.result,'api.deepseek.com/chat/completions');
  assert.equal((await fetch(base+'/.wenshu-ai.json')).status,404);
  assert.equal((await fetch(base+'/providers.js')).status,200);
  await stop(); await start();
  assert.equal((await call('/api/status')).data.provider,'deepseek');
  assert.equal((await call('/api/ai',{task:'outline',input:'Public sample',consent:true})).data.result,'api.deepseek.com/chat/completions');
  result=await call('/api/models',{provider:'qwen',apiKey:'test-key-dashscope.aliyuncs.com'});
  assert.equal(result.data.source,'preset');assert.equal(result.data.models[0].id,'qwen-plus');
  await call('/api/config',{provider:'qwen',apiKey:'test-key-dashscope.aliyuncs.com',model:'qwen-plus'});
  assert.equal((await call('/api/ai',{task:'rewrite',input:'Public sample',consent:true})).data.result,'dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
  await fetch(base+'/api/config',{method:'DELETE',headers:{Authorization:'Bearer test-access',Origin:base}});
  assert.equal((await call('/api/status')).data.aiConfigured,false);
  assert.equal((await readFile(path.join(folder,'.wenshu-ai.json'),'utf8')).includes('test-key'),false);
  await stop();await start();
  assert.equal((await call('/api/status')).data.aiConfigured,false);
});
