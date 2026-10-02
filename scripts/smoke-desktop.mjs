import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const executable=path.resolve(process.argv[2]||'dist/0.5.0/win-unpacked/文枢.exe');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'wenshu-desktop-smoke-')),report=path.join(profile,'smoke.json');
try{
 const child=spawn(executable,[],{windowsHide:true,env:{...process.env,WENSHU_PROFILE_DIR:profile,WENSHU_SMOKE_REPORT:report},stdio:'ignore'});
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{child.kill();reject(new Error('Desktop did not signal readiness within 45 seconds'));},45000);child.once('error',error=>{clearTimeout(timeout);reject(error);});child.once('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error('Desktop exited with '+code));});});
 const result=JSON.parse(fs.readFileSync(report,'utf8'));assert.equal(result.ready,true);assert.equal(result.version,'0.5.0');console.log('Packaged desktop renderer and preload ready: '+result.version);
}finally{assert.ok(path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(profile).startsWith('wenshu-desktop-smoke-'));fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:500});}
