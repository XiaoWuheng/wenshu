import fs from 'node:fs';
import path from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import '../workspace-schema.js';
export const validate=globalThis.WenshuSchema.validate;
export const LIMIT=globalThis.WenshuSchema.LIMIT;
export function atomic(file,raw){const tmp=file+'.tmp';fs.writeFileSync(tmp,raw,{encoding:'utf8',mode:0o600});const fd=fs.openSync(tmp,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);}
export class Workspace {
 constructor(dir){this.dir=dir;this.file=path.join(dir,'workspace.json');this.historyDir=path.join(dir,'history');fs.mkdirSync(this.historyDir,{recursive:true});this.lastSnapshot=0;}
 read(){if(!fs.existsSync(this.file))return null;const raw=fs.readFileSync(this.file,'utf8');validate(raw);return raw;}
 save(raw){validate(raw);if(Date.now()-this.lastSnapshot>60000)this.snapshot();atomic(this.file,raw);return true;}
 files(){return fs.readdirSync(this.historyDir).filter(n=>/^\d+-[a-f0-9]+\.json$/.test(n)).sort().reverse();}
 snapshot(reason='自动恢复点'){const raw=this.read();if(!raw)return false;const id=Date.now()+'-'+randomBytes(4).toString('hex')+'.json';atomic(path.join(this.historyDir,id),JSON.stringify({reason:String(reason).slice(0,100),createdAt:Date.now(),data:JSON.parse(raw)}));for(const old of this.files().slice(60))fs.unlinkSync(path.join(this.historyDir,old));this.lastSnapshot=Date.now();return true;}
 history(){return this.files().flatMap(id=>{try{const v=JSON.parse(fs.readFileSync(path.join(this.historyDir,id),'utf8'));validate(v.data);return [{id,reason:v.reason,createdAt:v.createdAt,projects:v.data.projects.length}];}catch{return [];}});}
 restore(id,damaged=false){if(!this.files().includes(id))throw new Error('恢复点不存在');const raw=JSON.stringify(validate(JSON.parse(fs.readFileSync(path.join(this.historyDir,id),'utf8')).data));if(damaged&&fs.existsSync(this.file))fs.copyFileSync(this.file,this.file+'.damaged-'+Date.now());else this.snapshot('恢复前的工作区');atomic(this.file,raw);return raw;}
 copyTo(destination){
  const source=fs.realpathSync(this.dir),target=fs.existsSync(destination)?fs.realpathSync(destination):path.resolve(destination);
  const rel=path.relative(source,target);if(!rel||(!rel.startsWith('..')&&!path.isAbsolute(rel)))throw new Error('请选择当前工作区之外的空文件夹');
  if(fs.existsSync(target)&&fs.readdirSync(target).length)throw new Error('目标文件夹非空，请选择新的空文件夹');
  fs.mkdirSync(target,{recursive:true});
  function copy(from,to){for(const e of fs.readdirSync(from,{withFileTypes:true})){if(e.isSymbolicLink())throw new Error('数据目录包含符号链接，无法自动复制');const src=path.join(from,e.name),dst=path.join(to,e.name);if(e.isDirectory()){fs.mkdirSync(dst);copy(src,dst);}else if(e.isFile()){fs.copyFileSync(src,dst,fs.constants.COPYFILE_EXCL);const hash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');if(hash(src)!==hash(dst))throw new Error('数据复制校验失败');}}}
  copy(source,target);return target;
 }
}
