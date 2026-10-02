(function(){
const LIMIT=100*1024*1024;
function validate(input){
 const parsed=typeof input==='string'?JSON.parse(input):structuredClone(input);const v=parsed?.data||parsed;
 if(!v||!Array.isArray(v.projects)||v.projects.length>10000)throw new Error('工作区项目列表不正确');
 if(new TextEncoder().encode(JSON.stringify(v)).length>LIMIT)throw new Error('工作区与备份上限均为 100 MB，请拆分项目');
 const ids=new Set();
 const id=x=>{if(typeof x!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(x)||ids.has(x))throw new Error('记录编号无效或重复');ids.add(x);};
 const string=(x,n=2000000)=>{if(typeof x!=='string'||x.length>n)throw new Error('记录文字格式或长度不正确');};
 for(const p of v.projects){id(p.id);string(p.name,500);for(const key of ['sources','claims','assets','drafts','checklist']){p[key]??=[];if(!Array.isArray(p[key])||p[key].length>20000)throw new Error('项目记录列表无效');for(const x of p[key]){id(x.id);if(key==='drafts'){string(x.title,500);string(x.content);if(x.versions!==undefined){if(!Array.isArray(x.versions)||x.versions.length>100)throw new Error('稿件版本无效');for(const version of x.versions){string(version.content);string(version.title,500);}}}if(key==='sources'){string(x.title,500);string(x.notes||'');if(x.excerpts!==undefined){if(!Array.isArray(x.excerpts))throw new Error('摘录无效');for(const q of x.excerpts){string(q.text);string(q.location||'',1000);}}}if(key==='claims'){string(x.text);if(!Array.isArray(x.sourceIds)||x.sourceIds.some(s=>!p.sources.some(a=>a.id===s)))throw new Error('核验来源不存在');}if(key==='assets')string(x.name,500);if(key==='checklist'&&(typeof x.done!=='boolean'||typeof x.label!=='string'))throw new Error('检查清单格式不正确');}}
 }
 if(v.profile!==undefined){if(!v.profile||typeof v.profile!=='object'||Array.isArray(v.profile))throw new Error('个人资料格式无效');for(const key of ['displayName','role','preferredChannel','bio'])if(v.profile[key]!==undefined)string(v.profile[key],3000);}
 v.trash??=[];if(!Array.isArray(v.trash)||v.trash.length>10000)throw new Error('回收站格式错误');
 for(const t of v.trash){if(!['sources','claims','assets','drafts'].includes(t.kind)||typeof t.projectId!=='string'||!t.record||typeof t.record.id!=='string')throw new Error('回收站记录格式错误');}
 v.schemaVersion=2;return v;
}
globalThis.WenshuSchema={validate,LIMIT};
})();
