const STORAGE_KEY = 'wenshu.workspace.v1';
const DEFAULT_PROFILE = {displayName:'本地创作者', role:'独立创作者', preferredChannel:'图文文章', bio:''};
const todayLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
const starterProjects = [
  { id: 'demo-tea', name: '巷口那间开了四十年的茶馆', type: '图文文章', description: '记录老街茶馆与街坊邻里的日常，写一篇关于城市记忆的深度特写。', status: '创作中', updatedAt: Date.now() - 1000 * 60 * 43, sources: [{id:'s1',title:'【虚构演示】街区历史档案',type:'演示记录',url:'',notes:'仅用于演示资料关联流程，不是真实来源；请替换为可查证的原始出处。'}], claims: [{id:'c1',text:'茶馆于1984年开业。',status:'待核验',sourceIds:[]},{id:'c2',text:'附近街区在2001年完成改造。',status:'已找到来源',sourceIds:['s1']}], assets: [{id:'a1',name:'老茶馆门头照片',kind:'图片',rights:'待确认',credit:'',source:'采访现场拍摄',location:'文章头图'}], drafts: [{id:'d1',title:'主稿 · 初稿',channel:'主稿',content:'清晨六点半，卷帘门刚刚升起，茶香就从巷子深处漫出来。\n\n这间茶馆开在老街转角。老板说，几十年来，桌椅换过几轮，来喝茶的人却总能叫出彼此的名字。\n\n【待补充：采访茶馆老板关于开店年份的原话】',updatedAt:Date.now()-1000*60*43}], checklist: [], published: false},
  { id: 'demo-podcast', name: '山海之间：手艺人的一天', type: '播客', description: '一档关于地方手艺与普通生活的声音记录。', status: '准备中', updatedAt: Date.now() - 1000 * 60 * 60 * 20, sources: [], claims: [], assets: [], drafts: [], checklist: [], published: false },
  { id: 'demo-video', name: '一碗面的城市地图', type: '短视频', description: '用一碗面串起城市迁徙、口味和记忆。', status: '待核验', updatedAt: Date.now() - 1000 * 60 * 60 * 36, sources: [], claims: [{id:'c3',text:'这家面馆的汤底每天熬制八小时。',status:'待核验',sourceIds:[]}], assets: [], drafts: [{id:'d2',title:'短视频脚本',channel:'短视频',content:'【开场】这座城的清晨，从一碗热汤开始。\n\n【镜头】后厨升起白雾，师傅揭开锅盖。\n\n【待核实】汤底熬制时长及具体做法。',updatedAt:Date.now()-1000*60*60*36}], checklist: [], published: false }
];
let unsavedWork = false;
let state = loadState();
let activePage = 'home';
let activeProjectId = null;
let activeProjectTab = 'overview';
let projectFilter = '全部';
let libraryFilter = '全部';
let projectSort = '最近更新';
let pendingTemplate = null;
let toastTimer;
let actionDialogHandler = null;
let aiServiceStatus = null;
let aiSelectionRange = null;

let pendingSaveTimer=null,saveRevision=0;
function loadState() {
 if(!window.wenshuDesktop){document.body.textContent='文枢现已转为桌面应用，请打开安装版或完整解压后的文枢.exe。';throw new Error('请使用桌面应用');}
 const raw=window.wenshuDesktop.read();if(raw){const parsed=WenshuSchema.validate(raw);return {...parsed,profile:{...DEFAULT_PROFILE,...(parsed.profile||{})}};}
 return {projects:[],trash:[],isDemo:false,profile:{...DEFAULT_PROFILE},schemaVersion:2};
}
function saveState(){
 clearTimeout(pendingSaveTimer);saveRevision++;
 try{window.wenshuDesktop.save(JSON.stringify(state));unsavedWork=false;setSaveLabel('已保存到本机');return true;}
 catch(error){unsavedWork=true;setSaveLabel('保存失败 · 请备份');toast('保存失败：'+error.message);return false;}
}
function scheduleSave(){
 unsavedWork=true;setSaveLabel('正在保存…');clearTimeout(pendingSaveTimer);const revision=++saveRevision;
 pendingSaveTimer=setTimeout(async()=>{try{await window.wenshuDesktop.saveAsync(JSON.stringify(state));if(revision===saveRevision){unsavedWork=false;setSaveLabel('已保存到本机');}}catch(error){if(revision!==saveRevision)return;unsavedWork=true;setSaveLabel('保存失败 · 请备份');toast('保存失败：'+error.message);}},600);
}
function flushSave(){if(!unsavedWork)return true;return saveState();}
function backupText(value,label,max=20000,optional=false){if(value==null&&optional)return '';if(typeof value!=='string'||value.length>max)throw new Error(`${label}格式不正确或超出长度限制`);return value;}
function backupId(value,label,ids){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,120}$/.test(value)||ids.has(value))throw new Error(`${label}编号无效或重复`);ids.add(value);return value;}
function backupArray(value,label,max=10000){if(value==null)return [];if(!Array.isArray(value)||value.length>max)throw new Error(`${label}列表格式不正确`);return value;}
function validateBackup(input){return WenshuSchema.validate(input);}
function setSaveLabel(label) {
  const el = document.getElementById('saveState'); if (!el) return;
  el.textContent = label;
  if (label === '正在保存…'||label.includes('失败')) return;
  window.clearTimeout(setSaveLabel.timer);
  setSaveLabel.timer = window.setTimeout(() => { if (el.textContent === '已保存到本地') el.textContent = '本地自动保存'; }, 2200);
}
function uid(prefix='x') { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`; }
function escapeHtml(value='') { return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function getProject(id=activeProjectId) { return state.projects.find(p => p.id === id); }
function relativeTime(timestamp) { const mins = Math.max(1, Math.floor((Date.now()-timestamp)/60000)); if (mins < 60) return `${mins} 分钟前更新`; const hrs=Math.floor(mins/60); if(hrs<24)return `${hrs} 小时前更新`; return `${Math.floor(hrs/24)} 天前更新`; }
function toast(message) { const el=document.getElementById('toast'); el.textContent=message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2600); }

function getAiAccessToken(){try{return sessionStorage.getItem('wenshu.accessToken')||'';}catch{return '';}}
function refreshAiAccessToken(value){try{if(value)sessionStorage.setItem('wenshu.accessToken',value);else sessionStorage.removeItem('wenshu.accessToken');return true;}catch{return false;}}
const providers = globalThis.WENSHU_PROVIDERS;
let selectedProvider = 'openai';
let configEpoch = 0;
let configSaving = false;
function configNote(message) { const note=document.getElementById('aiConfigNote');note.textContent=message;note.hidden=!message; }
function renderProviderChoices() {
  const root=document.getElementById('providerChoices');root.replaceChildren();
  Object.entries(providers).forEach(([id,p])=>{const label=document.createElement('label');label.className='provider-choice';const radio=document.createElement('input');radio.type='radio';radio.name='aiProvider';radio.value=id;radio.checked=id===selectedProvider;radio.addEventListener('change',()=>selectProvider(id));const copy=document.createElement('span');const strong=document.createElement('strong');strong.textContent=p.name;const small=document.createElement('small');small.textContent=p.description;copy.append(strong,small);label.append(radio,copy);root.append(label);});
}
function selectProvider(id) {
  if(configSaving)return;
  selectedProvider=id;configEpoch++;document.querySelectorAll('#providerChoices input').forEach(input=>input.checked=input.value===id);
  const p=providers[id],key=document.getElementById('aiApiKey'),select=document.getElementById('aiModelSelect');key.value='';key.placeholder=`填写 ${p.name} 的 API Key`;
  document.getElementById('aiProviderHint').textContent=p.name+(id==='qwen'?' · 使用北京地域的百炼 Key':'');
  document.getElementById('aiKeyLink').hidden=id==='custom';document.getElementById('aiKeyLink').href=p.keyUrl||'#';
  select.replaceChildren(new Option('填写 Key 后读取模型',''));select.disabled=true;document.getElementById('saveAiConfig').disabled=true;
  document.getElementById('loadAiModels').disabled=!aiServiceStatus;document.getElementById('loadAiModels').textContent='读取模型';configNote('');
  if(aiServiceStatus?.aiConfigured&&aiServiceStatus.provider===id){select.replaceChildren(new Option(aiServiceStatus.model,aiServiceStatus.model));select.disabled=false;document.getElementById('saveAiConfig').disabled=false;key.placeholder='已保存此服务商的 Key；留空继续使用';}
  const custom=id==='custom',saved=aiServiceStatus?.provider==='custom'&&aiServiceStatus.aiConfigured;
  document.getElementById('customProviderFields').hidden=!custom;
  document.getElementById('aiModelSelect').hidden=custom;
  document.getElementById('aiCustomModel').hidden=!custom;
  document.getElementById('customModelHelp').hidden=!custom;
  document.getElementById('aiBaseUrl').value=saved?aiServiceStatus.baseUrl||'':'';
  document.getElementById('aiApiStyle').value=saved?aiServiceStatus.apiStyle:'chat-completions';
  document.getElementById('aiNoAuth').checked=Boolean(saved&&aiServiceStatus.noAuth);
  document.getElementById('aiCustomModel').value=saved?aiServiceStatus.model:'';
  document.getElementById('customModelOptions').replaceChildren();
  if(custom)updateCustomConfig();else key.disabled=!aiServiceStatus;
}
function customConfigFields(){return {baseUrl:document.getElementById('aiBaseUrl').value.trim(),apiStyle:document.getElementById('aiApiStyle').value,noAuth:document.getElementById('aiNoAuth').checked};}
function updateCustomConfig(){
  if(selectedProvider!=='custom')return;
  const fields=customConfigFields(),key=document.getElementById('aiApiKey');
  const same=aiServiceStatus?.provider==='custom'&&fields.baseUrl.replace(/\/+$/,'')===aiServiceStatus.baseUrl&&fields.apiStyle===aiServiceStatus.apiStyle;
  key.disabled=!aiServiceStatus||fields.noAuth;
  key.placeholder=fields.noAuth?'此服务无需密钥':same&&!aiServiceStatus.noAuth?'已保存此地址的 Key；留空继续使用':'填写此地址对应的 API Key';
  document.getElementById('saveAiConfig').disabled=!aiServiceStatus||!fields.baseUrl||!document.getElementById('aiCustomModel').value.trim()||!(fields.noAuth||key.value.trim()||(same&&!aiServiceStatus.noAuth));
}

async function configRequest(path,method='GET',body) {
  const headers={};const token=getAiAccessToken();if(token)headers.Authorization='Bearer '+token;if(body)headers['Content-Type']='application/json';
  const response=await fetch(new URL('./api/'+path,location.href),{method,headers,body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(25000)});
  const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'连接失败，请检查文枢服务是否已启动。');return result;
}
async function refreshAiStatus() {
  try{
    aiServiceStatus=await configRequest('status');
    if(!Object.hasOwn(aiServiceStatus,'provider'))throw new Error('请重启文枢服务以启用新版配置。');
    document.getElementById('aiStatusBadge').textContent=aiServiceStatus.aiConfigured?'已保存':'待配置';
    document.getElementById('aiStatusText').textContent=aiServiceStatus.aiConfigured?`${providers[aiServiceStatus.provider]?.name||'自定义服务'} · ${aiServiceStatus.model}`:'按下方三步连接你的模型。';
    if(!window.wenshuDesktop&&aiServiceStatus.authRequired&&!getAiAccessToken())document.getElementById('aiStatusText').textContent+=' 此服务需要下方的访问口令。';
  }catch(error){aiServiceStatus=null;document.getElementById('aiStatusBadge').textContent='本地创作模式';document.getElementById('aiStatusText').textContent=error.message.includes('重启')?error.message:'AI 服务未连接，请重新打开文枢桌面版。当前仍可写作和备份。';}
  document.getElementById('aiApiKey').disabled=!aiServiceStatus;document.getElementById('clearAiConfig').disabled=!aiServiceStatus;
  selectProvider(aiServiceStatus?.provider&&providers[aiServiceStatus.provider]?aiServiceStatus.provider:selectedProvider);
  return aiServiceStatus;
}
async function loadAiModels(){
  const epoch=++configEpoch,provider=selectedProvider,key=document.getElementById('aiApiKey').value.trim(),button=document.getElementById('loadAiModels');
  if(provider!=='custom'&&!key&&!(aiServiceStatus?.aiConfigured&&aiServiceStatus.provider===provider)){configNote('请填写所选服务商的 API Key。');return;}
  button.disabled=true;button.textContent='正在读取…';configNote('');
  try{const result=await configRequest('models','POST',{provider,apiKey:key,...(provider==='custom'?customConfigFields():{})});if(epoch!==configEpoch)return;
    if(provider==='custom'){document.getElementById('customModelOptions').replaceChildren(...result.models.map(m=>new Option(m.id,m.id)));configNote(result.models.length?'已读取模型，可在模型 ID 输入框选择建议或手动填写。':'服务未返回模型列表，请手动填写模型 ID。');updateCustomConfig();return;}
    const select=document.getElementById('aiModelSelect');select.replaceChildren(...result.models.map(m=>new Option(m.id,m.id)));select.disabled=!result.models.length;document.getElementById('saveAiConfig').disabled=!result.models.length;
    configNote(result.source==='preset'?'这是通义千问预置文本模型，未验证 Key 或账户权限；请以百炼控制台授权为准。':result.models.length?'已读取服务商返回的模型。选择后保存；实际调用仍取决于模型权限和余额。':'没有找到可用文本模型，请检查账户权限。');
  }catch(error){if(epoch===configEpoch){configNote(error.message+(provider==='custom'?' 也可直接填写模型 ID 后保存。':''));document.getElementById('aiModelSelect').replaceChildren(new Option('读取失败，请重试',''));document.getElementById('saveAiConfig').disabled=true;}}
  finally{if(epoch===configEpoch){button.disabled=!aiServiceStatus;button.textContent='读取模型';if(provider==='custom')updateCustomConfig();}}
}
function lockConfig(locked){configSaving=locked;document.querySelectorAll('#providerChoices input, #aiBaseUrl, #aiApiStyle, #aiNoAuth, #aiCustomModel, #aiModelSelect, #aiApiKey, #loadAiModels, #saveAiConfig, #clearAiConfig, #refreshAiStatus').forEach(el=>el.disabled=locked);}
async function saveAiConfig(){
  const provider=selectedProvider,apiKey=document.getElementById('aiApiKey').value.trim(),model=(provider==='custom'?document.getElementById('aiCustomModel').value:document.getElementById('aiModelSelect').value).trim();
  if(!model||(provider!=='custom'&&!apiKey&&!(aiServiceStatus?.aiConfigured&&aiServiceStatus.provider===provider))){configNote('请填写对应的 Key 并选择模型。');return;}
  configEpoch++;lockConfig(true);configNote('正在保存…');
  try{await configRequest('config','POST',{provider,apiKey,model,...(provider==='custom'?customConfigFields():{})});document.getElementById('aiApiKey').value='';lockConfig(false);await refreshAiStatus();configNote('配置已保存。首次生成会验证模型调用权限；模型建议请审阅后再采用。');}
  catch(error){lockConfig(false);updateCustomConfig();configNote(error.message);}
}
async function clearAiConfig(){
  configEpoch++;lockConfig(true);
  try{await configRequest('config','DELETE');lockConfig(false);await refreshAiStatus();configNote('已移除密钥并停用 AI，创作资料不受影响。');}
  catch(error){lockConfig(false);updateCustomConfig();configNote(error.message);}
}
function openAiAssistant() {
  const dialog=document.getElementById('aiDialog'), editor=document.getElementById('draftEditor');
  const start=editor?.selectionStart??0,end=editor?.selectionEnd??0;
  const selected=editor&&end>start?editor.value.slice(start,end):'';
  aiSelectionRange=selected?{start,end,selected}:null;
  const task=document.getElementById('aiTask');task.value=selected?'rewrite':'outline';
  const input=document.getElementById('aiInput');input.value=selected;
  document.getElementById('aiConsent').checked=false;
  document.getElementById('aiResult').value='';
  document.getElementById('aiResultBox').hidden=true;
  document.getElementById('aiCopyResult').hidden=true;
  document.getElementById('aiApplyResult').hidden=true;
  document.getElementById('aiUnavailable').hidden=true;
  document.getElementById('aiSubmit').disabled=!aiServiceStatus?.aiConfigured;
  document.getElementById('aiSubmit').textContent=aiServiceStatus?.aiConfigured?'确认并生成':'AI 服务未就绪';
  input.placeholder=selected?'已填入刚才选中的文字；确认后仅这段文字会发送。':'粘贴或写下本次需要模型处理的内容。不会自动发送整篇稿件或项目资料。';
  document.getElementById('aiCharCount').textContent=input.value.length.toLocaleString()+' / 20,000';
  syncAiTaskDescription();
  if(!aiServiceStatus?.aiConfigured){
    const note=document.getElementById('aiUnavailable');
    note.textContent=window.wenshuDesktop?'到“设置与数据”选择模型服务并保存配置后即可使用。':'先到“设置与数据”启动本地服务并连接 API Key，选好模型后即可使用。';
    note.hidden=false;
  }
  prepareAiSources();
  dialog.showModal();
}
function syncAiTaskDescription() {
  const count=document.getElementById('aiInput')?.value.length||0;
  const scope=document.getElementById('aiScopeText');
  if(document.getElementById('aiPayloadPreview'))document.getElementById('aiPayloadPreview').value=buildAiInput();
  if(scope)scope.textContent='发送至 '+(providers[aiServiceStatus?.provider]?.name||'未配置')+' / '+(aiServiceStatus?.model||'未选择模型')+'：输入文字及你勾选的资料摘录。总计 '+(typeof buildAiInput==='function'?buildAiInput().length:count)+' / 20,000 字符。';
  const apply=document.getElementById('aiApplyResult');
  if(apply)apply.textContent=document.getElementById('aiTask')?.value==='claims'?'加入待核验清单':aiSelectionRange?'替换所选文字':'应用到稿件';
}
async function runAiTask(event) {
  event.preventDefault();
  const input=buildAiInput();
  if(!input)return;if(input.length>20000){toast('输入与选定资料合计超过 20,000 字符，请减少内容');return;}
  aiReviewBase={projectId:activeProjectId,draftId:getProject()?.drafts[0]?.id,content:getProject()?.drafts[0]?.content||'',input:document.getElementById('aiInput').value,range:aiSelectionRange?{...aiSelectionRange}:null};
  aiRequestController=new AbortController();const requestController=aiRequestController;document.getElementById('cancelAiGeneration').hidden=false;
  if(!aiServiceStatus?.aiConfigured){toast('AI 服务尚未配置。');return;}
  if(!document.getElementById('aiConsent').checked){toast('请先确认本次发送范围。');return;}
  const button=document.getElementById('aiSubmit'),task=document.getElementById('aiTask').value;
  button.disabled=true;button.textContent='正在生成…';document.querySelectorAll('#aiInput,#aiTask,#aiSourceSelection input').forEach(el=>el.disabled=true);
  document.getElementById('aiUnavailable').hidden=true;
  document.getElementById('aiResultBox').hidden=true;document.getElementById('aiCopyResult').hidden=true;document.getElementById('aiApplyResult').hidden=true;
  try {
    const headers={'Content-Type':'application/json'};
    const accessToken=getAiAccessToken();
    if(accessToken)headers.Authorization='Bearer '+accessToken;
    const response=await fetch(new URL('./api/ai',location.href),{method:'POST',headers,signal:requestController.signal,body:JSON.stringify({task,input,consent:true})});
    const payload=await response.json().catch(()=>({}));
    if(aiRequestController!==requestController)return;
    if(!response.ok)throw new Error(payload.error||'模型请求失败。');
    document.getElementById('aiResult').value=payload.result||'';
    document.getElementById('aiResultBox').hidden=false;
    document.getElementById('aiCopyResult').hidden=false;
    document.getElementById('aiApplyResult').hidden=false;
    button.textContent='重新生成';
    syncAiTaskDescription();renderAiReview();
  } catch(error) {
    if(aiRequestController!==requestController)return;
    const note=document.getElementById('aiUnavailable');
    note.textContent=error.name==='AbortError'?'已取消生成。上游服务可能已产生部分用量。':'没有生成结果：'+error.message;
    note.hidden=false;
  } finally {
    if(aiRequestController!==requestController)return;
    document.getElementById('cancelAiGeneration').hidden=true;aiRequestController=null;document.querySelectorAll('#aiInput,#aiTask,#aiSourceSelection input').forEach(el=>el.disabled=false);
    document.getElementById('aiConsent').checked=false;
    button.disabled=false;
    if(button.textContent==='正在生成…')button.textContent='确认并生成';
  }
}
function applyAiResult() {
  if(document.getElementById('aiTask').value!=='claims'){applyReviewedAi();return;}
  if(window.wenshuDesktop){try{window.wenshuDesktop.checkpoint('采用 AI 建议前');}catch(error){toast('无法建立恢复点：'+error.message);return;}}
  const result=document.getElementById('aiResult').value.trim(),task=document.getElementById('aiTask').value,project=getProject();
  if(!result||!project)return;
  if(task==='claims'){
    const claims=result.split(/\r?\n/).map(line=>line.trim())
      .filter(line=>/^([-*•]|\d+[.、)])\s*/.test(line))
      .map(line=>line.replace(/^([-*•]|\d+[.、)])\s*/,'').replace(/^["“]|["”]$/g,'').trim()).filter(Boolean);
    if(!claims.length){toast('结果中没有识别到编号清单；请检查后复制或重新生成。');return;}
    project.claims||=[];
    const existing=new Set(project.claims.map(claim=>claim.text.trim().toLocaleLowerCase()));
    const added=claims.filter(text=>!existing.has(text.toLocaleLowerCase())).map(text=>({id:uid('claim'),text,status:'待核验',sourceIds:[]}));
    if(!added.length){toast('这些核验项已存在。');return;}
    project.claims.unshift(...added);touchProject();activeProjectTab='claims';
    document.getElementById('aiDialog').close();render();toast('已加入 '+added.length+' 条待核验项；均未标记为已核验。');return;
  }
  const editor=document.getElementById('draftEditor');
  if(!editor){
    project.drafts||=[];
    const title=task==='outline'?'建议提纲':task==='headlines'?'标题备选':task==='repurpose'?'平台版本':'AI 建议';
    project.drafts.unshift({id:uid('draft'),title,channel:'待审阅建议',content:'—— AI 建议（待审阅） ——\n'+result,updatedAt:Date.now()});
    touchProject();activeProjectTab='draft';document.getElementById('aiDialog').close();render();toast('已创建建议稿件，请逐项审阅后继续编辑。');return;
  }
  if(task==='rewrite'&&aiSelectionRange){
    const range=aiSelectionRange;editor.value=editor.value.slice(0,range.start)+result+editor.value.slice(range.end);
    editor.setSelectionRange(range.start,range.start+result.length);
  } else editor.value=editor.value.trimEnd()+'\n\n—— AI 建议（待审阅） ——\n'+result;
  editor.dispatchEvent(new Event('input',{bubbles:true}));
  document.getElementById('aiDialog').close();toast('已应用到稿件并保存到本地，请继续审阅。');
}
function setPage(page) { if(!flushSave())return; activePage=page; activeProjectId=null; render(); document.querySelectorAll('.nav-item[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page)); }
function openProject(id) { if(!flushSave())return; activeProjectId=id; activeProjectTab='overview'; render(); }
function icon(type) { return ({'图文文章':'▤','短视频':'▷','播客':'◖','文化项目':'✳','自由创作':'✎'})[type]||'▤'; }
function projectProgress(p) { const claims=p.claims||[], assets=p.assets||[], drafts=p.drafts||[]; const checks=[drafts.length>0, claims.length===0||claims.every(c=>c.status==='已核验'), assets.every(a=>a.rights!=='待确认'), (p.checklist||[]).length>0]; return Math.round(checks.filter(Boolean).length/checks.length*100); }
function projectMetrics(p) { return `<div class="project-metrics"><span>▧ ${(p.sources||[]).length} 条资料</span><span>◌ ${(p.claims||[]).filter(c=>c.status!=='已核验').length} 项待核验</span><span>◈ ${(p.assets||[]).filter(a=>a.rights==='待确认').length} 项授权待补</span></div>`; }
function render() {
  const profile={...DEFAULT_PROFILE,...(state.profile||{})};
  const profileName=document.getElementById('profileQuickName'),profileAvatar=document.getElementById('profileAvatar');
  if(profileName)profileName.textContent=profile.displayName;
  if(profileAvatar)profileAvatar.textContent=(profile.displayName||'创').slice(0,1);
  const root=document.getElementById('viewRoot');
  if(activeProjectId && getProject()) { renderProject(root,getProject()); }
  else if(activePage==='projects') renderProjects(root);
  else if(activePage==='library') renderLibrary(root);
  else if(activePage==='templates') renderTemplates(root);
  else if(activePage==='profile') renderProfile(root);
  else renderHome(root);
  document.getElementById('projectCount').textContent=state.projects.length;
  const current=activeProjectId ? getProject()?.name : ({home:'创作总览',projects:'我的项目',library:'素材档案',templates:'项目模板',profile:'个人中心'})[activePage];
  document.getElementById('breadcrumbCurrent').textContent=current||'创作总览';
  bindDynamicEvents();if(typeof enhanceDesktopView==='function')enhanceDesktopView();
}
function renderProfile(root) {
  const profile={...DEFAULT_PROFILE,...(state.profile||{})};
  const projectCount=state.projects.filter(p=>p.status!=='已归档').length;
  const draftCount=state.projects.reduce((n,p)=>n+(p.drafts||[]).length,0);
  const sourceCount=state.projects.reduce((n,p)=>n+(p.sources||[]).length,0);
  const pendingCount=state.projects.reduce((n,p)=>n+(p.claims||[]).filter(c=>c.status!=='已核验').length,0);
  root.innerHTML=`<div class="profile-page"><header class="profile-heading"><div><div class="eyebrow">创作者档案</div><h1>个人中心</h1><p>管理你的创作身份与工作偏好。资料仅保存在桌面工作区。</p></div><div class="profile-seal">${escapeHtml((profile.displayName||'创').trim().slice(0,1)||'创')}</div></header><div class="profile-layout"><section class="profile-card"><div class="profile-card-heading"><div><div class="eyebrow">个人资料</div><h2>介绍一下你自己</h2><p>这些信息用于整理个人工作空间，不会公开展示或自动发送给 AI。</p></div></div><form id="profileForm" class="profile-form"><label class="field-label" for="profileName">显示名称</label><input class="text-input" id="profileName" name="displayName" maxlength="40" value="${escapeHtml(profile.displayName)}" placeholder="例如：林间编辑" required><label class="field-label" for="profileRole">工作身份</label><select class="text-input" id="profileRole" name="role"><option ${profile.role==='独立创作者'?'selected':''}>独立创作者</option><option ${profile.role==='记者 / 编辑'?'selected':''}>记者 / 编辑</option><option ${profile.role==='自媒体创作者'?'selected':''}>自媒体创作者</option><option ${profile.role==='文化工作者'?'selected':''}>文化工作者</option><option ${profile.role==='播客 / 视频制作人'?'selected':''}>播客 / 视频制作人</option><option ${profile.role==='其他'?'selected':''}>其他</option></select><label class="field-label" for="profileChannel">常用创作类型</label><select class="text-input" id="profileChannel" name="preferredChannel"><option ${profile.preferredChannel==='图文文章'?'selected':''}>图文文章</option><option ${profile.preferredChannel==='短视频'?'selected':''}>短视频</option><option ${profile.preferredChannel==='播客'?'selected':''}>播客</option><option ${profile.preferredChannel==='文化项目'?'selected':''}>文化项目</option><option ${profile.preferredChannel==='自由创作'?'selected':''}>自由创作</option></select><label class="field-label" for="profileBio">个人简介 <span>选填</span></label><textarea class="text-input textarea" id="profileBio" name="bio" rows="4" maxlength="240" placeholder="记录你的创作方向、关注领域或工作方式">${escapeHtml(profile.bio)}</textarea><div class="profile-form-footer"><span>保存在本机工作区 · 不需要账号</span><button class="button primary" type="submit">保存个人资料</button></div></form></section><aside class="profile-aside"><section class="profile-card profile-summary"><div class="eyebrow">工作空间概览</div><h2>${escapeHtml(profile.displayName)}</h2><p>${escapeHtml(profile.role)} · ${escapeHtml(profile.preferredChannel)}</p><div class="profile-stats"><div><strong>${projectCount}</strong><span>进行中项目</span></div><div><strong>${draftCount}</strong><span>稿件</span></div><div><strong>${sourceCount}</strong><span>资料来源</span></div><div><strong>${pendingCount}</strong><span>待核验事实</span></div></div></section><section class="profile-card profile-links"><div class="eyebrow">工作空间设置</div><button type="button" data-profile-action="settings"><span>⚙</span><span><strong>设置与数据</strong><small>备份、导入、清理数据与 AI 服务连接</small></span><b>→</b></button><button type="button" data-page="projects"><span>▤</span><span><strong>我的项目</strong><small>管理选题、稿件和项目记录</small></span><b>→</b></button><button type="button" data-profile-action="ai"><span>✦</span><span><strong>AI 创作助手</strong><small>打开项目后从顶部入口使用</small></span><b>→</b></button><div class="profile-local-note">目前是本地个人空间，不提供账号登录、云端同步或多人协作。请定期导出备份。</div></section></aside></div></div>`;
}
function saveProfile(event){event.preventDefault();const data=new FormData(event.currentTarget);state.profile={displayName:String(data.get('displayName')||'').trim()||DEFAULT_PROFILE.displayName,role:data.get('role'),preferredChannel:data.get('preferredChannel'),bio:String(data.get('bio')||'').trim()};if(!saveState())return;document.getElementById('profileQuickName').textContent=state.profile.displayName;document.getElementById('profileAvatar').textContent=state.profile.displayName.slice(0,1);render();toast('个人资料已保存在桌面工作区。');}
function renderHome(root) {
  const pendingClaims=state.projects.reduce((n,p)=>n+(p.claims||[]).filter(c=>c.status!=='已核验').length,0);
  const pendingAssets=state.projects.reduce((n,p)=>n+(p.assets||[]).filter(a=>a.rights==='待确认').length,0);
  const sorted=[...state.projects].sort((a,b)=>b.updatedAt-a.updatedAt);
  const next=sorted[0];
  root.innerHTML=`<div class="home-page home-refined"><section class="welcome-row refined-welcome"><div><div class="date-line">${todayLabel}<span class="welcome-kicker">${state.isDemo?'示例工作区':'个人工作空间'}</span></div><h1>让好内容，<em>有据可循。</em></h1><p class="welcome-sub">把灵感、资料与每一次判断，妥善安放。</p></div><button class="button primary" data-action="new-project">＋ 新建项目</button></section>
    <section class="home-focus"><div class="focus-copy"><div class="eyebrow">${state.isDemo?'示例项目':'继续手边的创作'}</div>${next?`<h2>${escapeHtml(next.name)}</h2><p>${escapeHtml(next.description||'从上次停下的地方继续。')}</p><button class="button secondary" data-action="open-project" data-id="${escapeHtml(next.id)}">打开项目 <span>→</span></button>`:`<h2>从一个想法开始</h2><p>为新的内容建立工作空间，慢慢收集资料与灵感。</p><button class="button secondary" data-action="new-project">创建第一个项目 <span>→</span></button>`}</div><div class="focus-ornament"><img class="focus-art" src="assets/tea-house-editorial.webp" alt="老街茶馆、树影与街巷的编辑插画"></div></section>
    <section class="attention-row"><div class="attention-heading"><div><div class="eyebrow">需要你确认</div><h2>待处理事项</h2></div><span>由你决定何时完成</span></div><div class="attention-cards"><button class="attention-card" data-action="first-pending-claim"><span class="attention-symbol coral-symbol">◌</span><span><strong>待核验事实</strong><small>关联来源，再由你确认核验结果</small></span><b>${pendingClaims}</b></button><button class="attention-card" data-action="first-pending-asset"><span class="attention-symbol sage-symbol">◈</span><span><strong>待确认授权</strong><small>补充素材的来源与使用条件</small></span><b>${pendingAssets}</b></button></div></section>
    <section class="section-heading refined-section-heading"><div><div class="eyebrow">项目</div><h2>手边的创作</h2></div><button class="text-link" data-action="go-projects">查看全部 <span>→</span></button></section>
    <section class="project-grid">${sorted.slice(0,2).map(projectCard).join('')}${sorted.length===0?emptyProjects():''}<article class="principle-inline"><span class="principle-mark">「</span><div><div class="eyebrow">文枢的约定</div><strong>工具可以帮忙，<br>最后的判断始终属于你。</strong><p>资料默认留在本地。AI 参与创作时，你决定发送什么、接受什么。</p></div></article></section></div>`;
}
function projectCard(p) {
  const status=displayStatus(p);
  const statusClass=status==='待核验'||status==='待确认授权'?'amber':status==='已发布'?'green':'blue';
  const kindIcon=icon(p.type);
  return `<article class="project-card" data-action="open-project" data-id="${escapeHtml(p.id)}"><div class="project-card-top"><span class="type-mark">${kindIcon}</span><span class="status-pill ${statusClass}"><i></i>${escapeHtml(status)}</span><button class="card-menu" data-action="project-menu" data-id="${escapeHtml(p.id)}" aria-label="项目菜单">···</button></div><h3>${escapeHtml(p.name)}</h3><p class="project-description">${escapeHtml(p.description||'为这个创作项目写下一句话。')}</p>${projectMetrics(p)}<div class="project-card-bottom"><span>${relativeTime(p.updatedAt)}</span><span class="card-arrow">↗</span></div></article>`;
}
function displayStatus(p){if(p.status==='已归档')return '已归档';if(p.published)return '已发布';if((p.claims||[]).some(c=>c.status!=='已核验'))return '待核验';if((p.assets||[]).some(a=>a.rights==='待确认'))return '待确认授权';if(!(p.drafts||[]).length)return '准备中';return '创作中';}
function emptyProjects() { return `<button class="empty-project" data-action="new-project"><span>＋</span><strong>从一个想法开始</strong><small>创建你的第一个创作项目</small></button>`; }
function renderProjects(root) { const filtered=state.projects.filter(p=>projectFilter==='全部'||(projectFilter==='已归档'?p.status==='已归档':projectFilter==='待核验'?(p.claims||[]).some(c=>c.status!=='已核验'):p.status!=='已归档'&&!p.published));const ordered=filtered.slice().sort((a,b)=>projectSort==='名称'?a.name.localeCompare(b.name,'zh-CN'):projectSort==='创建时间'?(a.createdAt||a.updatedAt)-(b.createdAt||b.updatedAt):b.updatedAt-a.updatedAt);const counts={'全部':state.projects.length,'进行中':state.projects.filter(p=>p.status!=='已归档'&&!p.published).length,'待核验':state.projects.filter(p=>(p.claims||[]).some(c=>c.status!=='已核验')).length,'已归档':state.projects.filter(p=>p.status==='已归档').length};root.innerHTML=`<div class="subpage"><div class="page-heading"><div><div class="eyebrow">工作空间</div><h1>我的项目</h1><p>为正在创作的内容保留一个清楚、可追溯的工作空间。</p></div><button class="button primary" data-action="new-project">＋ 新建项目</button></div><div class="filter-row"><div class="segmented">${Object.entries(counts).map(([label,count])=>`<button class="${projectFilter===label?'selected':''}" data-project-filter="${label}">${label}<span>${count}</span></button>`).join('')}</div><label class="sort-select">排序<select data-project-sort><option ${projectSort==='最近更新'?'selected':''}>最近更新</option><option ${projectSort==='名称'?'selected':''}>名称</option><option ${projectSort==='创建时间'?'selected':''}>创建时间</option></select></label></div><div class="project-grid full-grid">${ordered.length?ordered.map(projectCard).join(''):`<div class="empty-state project-empty"><span>▤</span><strong>${projectFilter==='全部'?'还没有项目':'没有符合条件的项目'}</strong><p>${projectFilter==='全部'?'从一个选题、脚本或内容计划开始。':'试试其他项目状态。'}</p>${projectFilter==='全部'?'<button class="button secondary" data-action="new-project">创建第一个项目</button>':''}</div>`}</div></div>`; }
function renderLibrary(root){const allAssets=state.projects.flatMap(p=>(p.assets||[]).map(a=>({...a,projectName:p.name,projectId:p.id,kind:'素材'})));const allSources=state.projects.flatMap(p=>(p.sources||[]).map(s=>({...s,projectName:p.name,projectId:p.id,kind:'资料来源'})));const items=libraryFilter==='素材'?allAssets:libraryFilter==='资料来源'?allSources:[...allAssets,...allSources];root.innerHTML=`<div class="subpage"><div class="page-heading"><div><div class="eyebrow">素材档案</div><h1>素材与来源</h1><p>跨项目查看资料、素材和授权状态；每条记录都可以回到所属项目。</p></div><button class="button primary" data-action="library-add">＋ 添加记录</button></div><div class="library-toolbar"><div class="library-tabs">${[['全部',allAssets.length+allSources.length],['素材',allAssets.length],['资料来源',allSources.length]].map(([label,count])=>`<button class="${libraryFilter===label?'selected':''}" data-library-tab="${label}">${label}<span>${count}</span></button>`).join('')}</div><span class="library-help">共 ${items.length} 条记录</span></div><div class="library-list">${items.length?items.map(item=>`<button class="library-row" data-action="open-record" data-id="${escapeHtml(item.projectId)}" data-kind="${item.kind}"><span class="library-kind">${item.kind==='素材'?'◈':'▧'}</span><span class="library-main"><strong>${escapeHtml(item.title||item.name)}</strong><small>${escapeHtml(item.projectName)} · ${escapeHtml(item.type||item.kind||'')} · ${escapeHtml(item.url||item.source||'来源待补')}</small></span><span class="status-pill ${item.kind==='素材'&&item.rights==='待确认'?'amber':'neutral'}">${escapeHtml(item.kind==='素材'?item.rights||'状态待补':'已收录')}</span><span class="card-arrow">↗</span></button>`).join(''):`<div class="empty-state"><span>${libraryFilter==='素材'?'◈':'▧'}</span><strong>${libraryFilter==='全部'?'还没有资料或素材':`还没有${libraryFilter}`}</strong><p>在创作项目中添加记录后，这里会自动汇总。</p><button class="button secondary" data-action="library-add">选择项目添加</button></div>`}</div></div>`;}
function renderTemplates(root) { const templates=[['采访报道','从采访提纲到事实核验，适合人物与现场报道。','✎'],['短视频脚本','梳理开场、段落、画面与发布文案。','▷'],['播客单集','整理节目结构、嘉宾资料与声音素材授权。','◖'],['文化活动记录','记录活动信息、引用来源与影像授权。','✳']]; root.innerHTML=`<div class="subpage"><div class="page-heading"><div><div class="eyebrow">创作方式</div><h1>创作模板</h1><p>从一套合适的结构开始，再写出自己的东西。</p></div></div><div class="template-grid">${templates.map((t,i)=>`<article class="template-card"><span class="template-icon">${t[2]}</span><span class="template-number">0${i+1}</span><h3>${t[0]}</h3><p>${t[1]}</p><button class="text-link" data-action="template-create" data-type="${t[0]}">用这个模板 <span>→</span></button></article>`).join('')}</div><div class="template-note"><span>✦</span><p>模板只提供起步结构。内容、判断和最后的表达，始终由你决定。</p></div></div>`; }

function renderProject(root,p) {
  const tabs=[['overview','项目总览'],['sources','资料'],['draft','创作'],['claims','事实核验'],['assets','素材与授权'],['publish','发布检查']];
  const countClaims=(p.claims||[]).filter(c=>c.status!=='已核验').length, countAssets=(p.assets||[]).filter(a=>a.rights==='待确认').length;
  const tabBody=activeProjectTab==='overview'?projectOverview(p):activeProjectTab==='sources'?sourcesView(p):activeProjectTab==='draft'?draftView(p):activeProjectTab==='claims'?claimsView(p):activeProjectTab==='assets'?assetsView(p):publishView(p);
  root.innerHTML=`<div class="project-page"><div class="project-page-head"><button class="back-link" data-action="go-projects">← 我的项目</button><div class="project-head-row"><div><div class="project-kicker"><span class="type-mark small-mark">${icon(p.type)}</span>${escapeHtml(p.type)} <span class="crumb-slash">·</span><span class="status-pill ${p.status==='待核验'?'amber':'blue'}"><i></i>${escapeHtml(p.status||'创作中')}</span></div><h1>${escapeHtml(p.name)}</h1><p>${escapeHtml(p.description||'为这个创作项目写下一句话。')}</p></div><div class="project-head-actions"><button class="button secondary" data-action="export-project" data-id="${escapeHtml(p.id)}">↓ 导出项目</button><button class="button primary" data-action="project-add" data-id="${escapeHtml(p.id)}">＋ 添加内容</button></div></div><nav class="project-tabs">${tabs.map(([key,label])=>`<button class="project-tab ${activeProjectTab===key?'active':''}" data-tab="${key}">${label}${key==='claims'&&countClaims?`<span class="tab-badge">${countClaims}</span>`:''}${key==='assets'&&countAssets?`<span class="tab-badge amber-badge">${countAssets}</span>`:''}</button>`).join('')}</nav></div><div class="project-content">${tabBody}</div></div>`;
}
function recommendedStep(p) {
  const claims=p.claims||[],assets=p.assets||[],sources=p.sources||[],drafts=p.drafts||[],checks=p.checklist||[];
  if(!sources.length)return {title:'先收好第一条资料',detail:'记录采访、链接或个人笔记，让创作从可回查的来源开始。',tab:'sources',cta:'添加资料'};
  if(!drafts.length)return {title:'用资料写下第一版',detail:'先搭出结构、场景或核心观点，后续可以继续打磨。',tab:'draft',cta:'开始写作'};
  if(claims.some(c=>c.status!=='已核验'))return {title:'核对稿件中的事实说法',detail:'从日期、数字、人名和直接引语开始，关联来源后再确认结论。',tab:'claims',cta:'继续核验'};
  if(assets.some(a=>a.rights==='待确认'))return {title:'确认素材来源与授权',detail:'核对使用范围和署名要求，信息不清楚时先保留待确认。',tab:'assets',cta:'查看素材'};
  if(!checks.length||checks.some(c=>!c.done))return {title:'完成发布前检查',detail:'逐项检查事实、引用、授权、隐私和渠道信息。',tab:'publish',cta:'检查发布准备'};
  return {title:'创作材料已整理好',detail:'可导出项目包交接、留档，或继续回到稿件打磨表达。',action:'export-project',cta:'导出项目包'};
}function projectOverview(p) {
  const claims=p.claims||[],assets=p.assets||[],sources=p.sources||[],drafts=p.drafts||[];
  const nextStep=recommendedStep(p);
  const todo=[]; claims.filter(c=>c.status!=='已核验').forEach(c=>todo.push({icon:'◌',title:`待核验：${c.text}`,meta:'事实核验',tab:'claims'})); assets.filter(a=>a.rights==='待确认').forEach(a=>todo.push({icon:'◈',title:`补充授权信息：${a.name}`,meta:'素材与授权',tab:'assets'})); if(!drafts.length)todo.push({icon:'▤',title:'开始撰写第一版内容',meta:'创作',tab:'draft'});
  const steps=[['收集资料',sources.length>0],['形成初稿',drafts.length>0],['核验事实',claims.length===0||claims.every(c=>c.status==='已核验')],['确认授权',assets.every(a=>a.rights!=='待确认')],['发布检查',(p.checklist||[]).length>0&&(p.checklist||[]).every(c=>c.done)]];
  return `<div class="overview-layout"><div class="overview-main"><section class="workflow-card"><div class="section-heading inline-heading"><div><div class="eyebrow">创作进度</div><h2>创作进度</h2></div><span class="muted-small">${steps.filter(x=>x[1]).length} / ${steps.length} 步</span></div><div class="workflow-steps">${steps.map((s,i)=>`<button class="workflow-step ${s[1]?'done':''}" data-tab="${['sources','draft','claims','assets','publish'][i]}"><span class="step-circle">${s[1]?'✓':String(i+1).padStart(2,'0')}</span><span>${s[0]}</span>${i<steps.length-1?'<i class="step-line"></i>':''}</button>`).join('')}</div></section><section class="next-step-card"><div class="next-step-copy"><div class="eyebrow">编辑建议 · 推荐下一步</div><h3>${escapeHtml(nextStep.title)}</h3><p>${escapeHtml(nextStep.detail)}</p></div><button class="button primary" ${nextStep.action?`data-action="${nextStep.action}" data-id="${escapeHtml(p.id)}"`:`data-tab="${nextStep.tab}"`}>${escapeHtml(nextStep.cta)} <span>→</span></button></section><section class="overview-section"><div class="section-heading inline-heading"><div><div class="eyebrow">待处理</div><h2>接下来</h2></div><span class="muted-small">${todo.length} 项待处理</span></div>${todo.length?`<div class="todo-list">${todo.slice(0,4).map(t=>`<button class="todo-row" data-tab="${t.tab}"><span class="todo-icon">${t.icon}</span><span class="todo-copy"><strong>${escapeHtml(t.title)}</strong><small>${t.meta}</small></span><span class="card-arrow">→</span></button>`).join('')}</div>`:`<div class="calm-empty"><span>✦</span><div><strong>眼下没有待办</strong><p>需要处理的事情会在这里出现。</p></div></div>`}</section><section class="overview-section"><div class="section-heading inline-heading"><div><div class="eyebrow">最近更新</div><h2>最近更新</h2></div></div>${drafts.length?`<button class="recent-draft" data-tab="draft"><span class="draft-icon">▤</span><span><strong>${escapeHtml(drafts[0].title)}</strong><small>${relativeTime(drafts[0].updatedAt||p.updatedAt)}</small></span><span class="card-arrow">↗</span></button>`:`<div class="calm-empty"><span>✎</span><div><strong>还没有创作内容</strong><p>先记下一段想法，后续可以慢慢打磨。</p></div><button class="button secondary" data-tab="draft">开始写作</button></div>`}</section></div><aside class="overview-aside"><div class="aside-card"><div class="aside-card-title"><span>项目一览</span><span class="tiny-seal">枢</span></div><div class="overview-number"><strong>${sources.length}</strong><span>资料来源</span></div><div class="overview-number"><strong>${claims.length}</strong><span>核验事项</span></div><div class="overview-number"><strong>${assets.length}</strong><span>素材记录</span></div><div class="aside-divider"></div><div class="last-updated"><span class="online-dot"></span>最近更新 ${relativeTime(p.updatedAt)}</div></div><div class="aside-tip"><span class="tip-spark">✦</span><strong>文枢小笺</strong><p>先把来源记下来，写作时就不必回头寻找。每个事实都可以关联一条或多条资料。</p></div></aside></div>`;
}
function sourcesView(p) { return `<div class="tab-content"><div class="tab-title-row"><div><div class="eyebrow">资料整理</div><h2>资料来源</h2><p>记录链接、采访、文件和灵感笔记，为创作留下来路。</p></div><button class="button primary" data-action="add-source">＋ 添加资料</button></div><div class="add-inline-panel" id="sourceFormPanel" hidden><form id="sourceForm" class="inline-form"><div class="form-grid"><label>资料标题<input name="title" class="text-input" placeholder="例如：区志中的街区沿革" required></label><label>资料类型<select name="type" class="text-input"><option>网页链接</option><option>采访记录</option><option>文件资料</option><option>个人笔记</option><option>引用摘录</option></select></label><label class="wide-field">链接或来源说明<input name="url" class="text-input" placeholder="粘贴网址，或写明资料出处"></label><label class="wide-field">备注<textarea name="notes" class="text-input" rows="2" placeholder="记录哪些信息值得回查"></textarea></label></div><div class="form-actions"><button type="button" class="button secondary" data-action="cancel-source">取消</button><button class="button primary">保存资料</button></div></form></div>${p.sources.length?`<div class="record-list">${p.sources.map(s=>`<article class="record-card"><span class="record-icon">▧</span><div class="record-main"><strong>${escapeHtml(s.title)}</strong><div class="record-meta"><span>${escapeHtml(s.type)}</span><span>·</span><span>${escapeHtml(s.url||'未添加链接')}</span></div>${s.notes?`<p>${escapeHtml(s.notes)}</p>`:''}</div><button class="record-more" data-action="delete-source" data-id="${escapeHtml(s.id)}">删除</button></article>`).join('')}</div>`:`<div class="empty-state large-empty"><span>▧</span><strong>从资料开始，让创作有根有据</strong><p>可以先添加一条网页链接、一段采访记录，或一份个人笔记。</p><button class="button secondary" data-action="add-source">添加第一条资料</button></div>`}</div>`; }
function draftView(p) { const drafts=p.drafts||[]; const current=drafts[0]; return `<div class="draft-workspace"><div class="draft-sidebar"><div class="draft-sidebar-head"><span class="eyebrow">稿件</span><button class="small-add" data-action="new-draft">＋</button></div>${drafts.map(d=>`<button class="draft-list-item ${current?.id===d.id?'selected':''}" data-draft="${escapeHtml(d.id)}"><span class="draft-list-icon">▤</span><span><strong>${escapeHtml(d.title)}</strong><small>${escapeHtml(d.channel||'主稿')}</small></span></button>`).join('')||`<p class="draft-sidebar-empty">还没有稿件</p>`}</div><div class="editor-panel">${current?`<div class="editor-toolbar"><div><span class="save-dot"></span><span>自动保存</span><span class="toolbar-divider">|</span><span>${current.content.length} 字</span></div><div><button class="editor-action" data-action="ai-assist">✦ AI 辅助</button><button class="editor-action" data-action="draft-checkpoint">保存版本</button><button class="editor-action" data-action="draft-history">版本比较</button><button class="editor-action" data-action="draft-delete">删除稿件</button><button class="editor-action" data-action="export-draft">↓ 导出</button></div></div><input class="draft-title-input" id="draftTitle" value="${escapeHtml(current.title)}" aria-label="稿件标题"><textarea class="draft-editor" id="draftEditor" placeholder="从一句话开始……">${escapeHtml(current.content)}</textarea><div class="editor-footer"><span>✦ ${window.wenshuDesktop?'本机工作区 · 自动保存':'内容保存在桌面工作区'}</span><span>选中文字可添加为核验事项</span><button class="button secondary small-button" data-action="selected-to-claim">将选中内容加入核验 →</button></div>`:`<div class="empty-state editor-empty"><span>✎</span><strong>写下第一段内容</strong><p>从一个观察、一句采访或一个问题开始。</p><button class="button primary" data-action="new-draft">新建稿件</button></div>`}</div><aside class="editor-aside"><div class="aside-card"><div class="aside-card-title"><span>写作时可参考</span><span class="tiny-seal">据</span></div><div class="reference-count">${p.sources.length} <small>条资料</small></div>${p.sources.slice(0,4).map(s=>`<button class="reference-item" data-tab="sources"><span>▧</span><span>${escapeHtml(s.title)}</span><b>↗</b></button>`).join('')||`<p class="muted-paragraph">添加资料后，可以在写作时快速查阅。</p>`}<button class="text-link" data-tab="sources">管理资料 <span>→</span></button></div><div class="aside-tip"><span class="tip-spark">✦</span><strong>可选 AI 创作辅助</strong><p>仅在本次确认后发送你填写的文字；模型建议需由你审阅并主动采纳。</p></div></aside></div>`; }
function claimsView(p) { return `<div class="tab-content"><div class="tab-title-row"><div><div class="eyebrow">编辑台</div><h2>事实核验</h2><p>把具体说法与来源关联起来。核验结论由你确认。</p></div><button class="button primary" data-action="add-claim">＋ 添加核验项</button></div>${p.claims.length?`<div class="claim-list">${p.claims.map(c=>{const linked=(c.sourceIds||[]).map(id=>p.sources.find(s=>s.id===id)).filter(Boolean);return `<article class="claim-card"><div class="claim-card-top"><span class="status-pill ${c.status==='已核验'?'green':c.status==='已找到来源'?'blue':'amber'}"><i></i>${escapeHtml(c.status)}</span><button class="record-more" data-action="delete-claim" data-id="${escapeHtml(c.id)}">删除</button></div><p class="claim-text">“${escapeHtml(c.text)}”</p>${linked.length?`<div class="claim-linked">${linked.map(s=>`<span>▧ ${escapeHtml(s.title)}</span>`).join('')}</div>`:`<div class="claim-unlinked">尚未关联资料来源</div>`}<div class="claim-bottom"><span>${linked.length} 条关联资料</span><div><select class="claim-status-select" data-claim-status="${escapeHtml(c.id)}"><option ${c.status==='待核验'?'selected':''}>待核验</option><option ${c.status==='已找到来源'?'selected':''}>已找到来源</option><option ${c.status==='已核验'?'selected':''}>已核验</option><option ${c.status==='存在冲突'?'selected':''}>存在冲突</option><option ${c.status==='需要改写'?'selected':''}>需要改写</option></select><button class="text-link compact" data-action="link-source" data-id="${escapeHtml(c.id)}">关联资料 →</button></div></div></article>`;}).join('')}</div>`:`<div class="empty-state large-empty"><span>◌</span><strong>把需要核对的说法放在这里</strong><p>例如具体日期、数字、引语、人名和历史信息。</p><button class="button secondary" data-action="add-claim">添加第一项</button></div>`}<div class="note-box"><span>ⓘ</span> 文枢只帮助你整理核验过程，不会自动判断内容为真。</div></div>`; }
function assetsView(p) { return `<div class="tab-content"><div class="tab-title-row"><div><div class="eyebrow">项目档案</div><h2>素材与授权</h2><p>记录图片、音乐、字体、引文等素材的来源和使用条件。</p></div><button class="button primary" data-action="add-asset">＋ 添加素材</button></div>${p.assets.length?`<div class="asset-table"><div class="asset-table-head"><span>素材</span><span>来源与用途</span><span>授权状态</span><span></span></div>${p.assets.map(a=>`<div class="asset-row"><div class="asset-name"><span class="asset-icon">${a.kind==='音乐'?'♫':a.kind==='视频'?'▷':'▧'}</span><strong>${escapeHtml(a.name)}</strong></div><div class="asset-origin"><span>${escapeHtml(a.source||'来源待补')}</span><small>${escapeHtml(a.location||'使用位置未填')}</small><small>${escapeHtml(a.credit?`署名：${a.credit}`:'署名未记录')}</small></div><div><select class="asset-status-select ${a.rights==='待确认'?'pending':''}" data-asset-status="${escapeHtml(a.id)}"><option ${a.rights==='待确认'?'selected':''}>待确认</option><option ${a.rights==='已取得授权'?'selected':''}>已取得授权</option><option ${a.rights==='自己创作'?'selected':''}>自己创作</option><option ${a.rights==='开放许可'?'selected':''}>开放许可</option><option ${a.rights==='不用于当前项目'?'selected':''}>不用于当前项目</option></select></div><button class="record-more" data-action="delete-asset" data-id="${escapeHtml(a.id)}">删除</button></div>`).join('')}</div>`:`<div class="empty-state large-empty"><span>◈</span><strong>素材也有自己的来处</strong><p>记录来源、授权范围、署名要求和使用位置。</p><button class="button secondary" data-action="add-asset">添加第一项素材</button></div>`}<div class="note-box"><span>ⓘ</span> 请根据权利人或授权文件确认使用条件。文枢不会自动判断素材可否商用。</div></div>`; }
function publishView(p) { const defaults=[['事实与引用已有来源或核验记录','claim'],['素材来源与授权状态已确认','asset'],['署名要求已记录','credit'],['AI 辅助内容已人工检查','ai'],['隐私与敏感信息已检查','privacy'],['标题、简介和封面已准备','packaging']]; if(!p.checklist||p.checklist.length===0)p.checklist=defaults.map(x=>({id:uid('check'),label:x[0],done:false})); return `<div class="tab-content"><div class="tab-title-row"><div><div class="eyebrow">发布准备</div><h2>发布前检查</h2><p>逐项确认发布准备情况。所有勾选均由你确认。</p></div><button class="button secondary" data-action="export-project" data-id="${escapeHtml(p.id)}">↓ 导出项目备份</button><button class="button primary" data-action="export-delivery" data-id="${escapeHtml(p.id)}">导出交付稿</button></div><div class="publish-summary"><div class="publish-progress"><span class="progress-ring" style="--progress:${Math.round(p.checklist.filter(x=>x.done).length/p.checklist.length*100)}%"><b>${p.checklist.filter(x=>x.done).length}<small>/${p.checklist.length}</small></b></span><div><strong>${p.checklist.every(x=>x.done)?'检查完成':'完成发布前检查'}</strong><p>${p.checklist.filter(x=>!x.done).length?`还有 ${p.checklist.filter(x=>!x.done).length} 项待确认。`:'你已完成所有清单项，可以导出项目材料。'}</p></div></div></div><div class="checklist">${p.checklist.map(c=>`<label class="checklist-row ${c.done?'checked':''}"><input type="checkbox" data-check="${escapeHtml(c.id)}" ${c.done?'checked':''}><span class="custom-check">${c.done?'✓':''}</span><span>${escapeHtml(c.label)}</span><small>${c.done?'已确认':'待确认'}</small></label>`).join('')}</div><div class="note-box"><span>ⓘ</span> 完成清单不等于法律或事实认证。发布责任仍由创作者和发布方承担。</div></div>`; }

function bindDynamicEvents() {
  document.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',handleAction));
  document.querySelectorAll('[data-profile-action]').forEach(el=>el.addEventListener('click',()=>{if(el.dataset.profileAction==='settings')document.getElementById('settingsDialog').showModal();if(el.dataset.profileAction==='ai')toast('请先打开一个项目，再点击页面顶部的“AI 助手”。');}));
  document.querySelectorAll('.profile-links [data-page="projects"]').forEach(el=>el.addEventListener('click',()=>setPage('projects')));
  document.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>{if(!flushSave())return;activeProjectTab=el.dataset.tab;render();}));
  document.querySelectorAll('[data-project-filter]').forEach(el=>el.addEventListener('click',()=>{projectFilter=el.dataset.projectFilter;render();}));
  document.querySelectorAll('[data-project-sort]').forEach(el=>el.addEventListener('change',()=>{projectSort=el.value;render();}));
  document.querySelectorAll('[data-library-tab]').forEach(el=>el.addEventListener('click',()=>{libraryFilter=el.dataset.libraryTab;render();}));
  const profileForm=document.getElementById('profileForm');if(profileForm)profileForm.addEventListener('submit',saveProfile);
  document.querySelectorAll('[data-claim-status]').forEach(el=>el.addEventListener('change',()=>{const c=getProject().claims.find(x=>x.id===el.dataset.claimStatus);c.status=el.value;if(c.status==='已核验'){c.reviewedDrafts=Object.fromEntries(getProject().drafts.map(d=>[d.id,true]));c.reviewedAt=Date.now();}touchProject();render();}));
  document.querySelectorAll('[data-asset-status]').forEach(el=>el.addEventListener('change',()=>{const a=getProject().assets.find(x=>x.id===el.dataset.assetStatus);a.rights=el.value;touchProject();render();}));
  document.querySelectorAll('[data-check]').forEach(el=>el.addEventListener('change',()=>{const p=getProject(); const item=p.checklist.find(x=>x.id===el.dataset.check);item.done=el.checked;touchProject();render();}));
  document.querySelectorAll('[data-draft]').forEach(el=>el.addEventListener('click',()=>{if(!flushSave())return;const p=getProject();p.drafts.unshift(p.drafts.splice(p.drafts.findIndex(d=>d.id===el.dataset.draft),1)[0]);render();}));
  const editor=document.getElementById('draftEditor'); if(editor)editor.addEventListener('input',()=>{const p=getProject(),d=p.drafts[0];autoDraftVersion(d);invalidateClaims(p,d);d.content=editor.value;d.updatedAt=Date.now();p.updatedAt=Date.now();scheduleSave();});
  const title=document.getElementById('draftTitle');if(title)title.addEventListener('input',()=>{getProject().drafts[0].title=title.value;scheduleSave();});
  const sourceForm=document.getElementById('sourceForm');if(sourceForm)sourceForm.addEventListener('submit',submitSource);
}
function openFormDialog({eyebrow='项目操作',title,description='',fields,submit='保存',onSubmit}) {
  actionDialogHandler=onSubmit;
  const dialog=document.getElementById('actionDialog');
  dialog.innerHTML=`<form id="actionDialogForm"><div class="modal-top"><div><div class="eyebrow">${escapeHtml(eyebrow)}</div><h2>${escapeHtml(title)}</h2>${description?`<p class="dialog-description">${escapeHtml(description)}</p>`:''}</div><button type="button" class="modal-close" data-dialog-close>×</button></div><div class="dialog-fields">${fields}</div><div class="modal-actions"><button type="button" class="button secondary" data-dialog-close>取消</button><button class="button primary" type="submit">${escapeHtml(submit)}</button></div></form>`;
  dialog.querySelectorAll('[data-dialog-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
  dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();const data=new FormData(event.currentTarget);try{if(actionDialogHandler?.(data)!==false){dialog.close();actionDialogHandler=null;}}catch(error){toast(error.message);}});
  dialog.showModal();
}
function openConfirmDialog({title,description,confirmLabel='确认',danger=false,onConfirm}) {
  openFormDialog({eyebrow:'请确认操作',title,description,submit:confirmLabel,fields:'',onSubmit:()=>{onConfirm();return true;}});
  const submit=document.querySelector('#actionDialog .button.primary');if(danger)submit.classList.add('danger');
}
function handleAction(e) {
  const el=e.currentTarget, action=el.dataset.action, id=el.dataset.id;
  if(action==='new-project') document.getElementById('projectDialog').showModal();
  if(action==='go-projects')setPage('projects');
  if(action==='go-library')setPage('library');
  if(action==='open-project'&&id)openProject(id);
  if(action==='open-record'&&id){activeProjectId=id;activeProjectTab=el.dataset.kind==='素材'?'assets':'sources';render();}
  if(action==='project-menu'){e.stopPropagation();const p=state.projects.find(x=>x.id===id),archived=p.status==='已归档';openConfirmDialog({title:archived?`恢复「${p.name}」？`:`归档「${p.name}」？`,description:archived?'项目将重新出现在进行中项目列表。':'项目会从进行中列表移出，内容和记录仍会保留。',confirmLabel:archived?'恢复项目':'归档项目',onConfirm:()=>{p.status=archived?'创作中':'已归档';touchProject();render();}});}
  if(action==='add-source'){document.getElementById('sourceFormPanel').hidden=false;document.querySelector('#sourceFormPanel input[name="title"]').focus();}
  if(action==='cancel-source')document.getElementById('sourceFormPanel').hidden=true;
  if(action==='delete-source'){removeRecord('sources',id);return;}
  if(action==='new-draft'){const p=getProject();p.drafts.unshift({id:uid('d'),title:'新建稿件',channel:'主稿',content:'',updatedAt:Date.now()});touchProject();render();document.getElementById('draftTitle')?.focus();}
  if(action==='add-claim')addClaim();
  if(action==='delete-claim'){removeRecord('claims',id);return;}
  if(action==='add-asset')addAsset();
  if(action==='delete-asset'){removeRecord('assets',id);return;}
  if(action==='link-source')linkSource(id);
  if(action==='selected-to-claim')selectedToClaim();
  if(action==='ai-assist')openAiAssistant();
  if(action==='draft-checkpoint'){saveDraftVersion();return;}
  if(action==='draft-history'){showDraftHistory();return;}
  if(action==='draft-delete'){removeRecord('drafts',getProject().drafts[0].id);return;}
  if(action==='draft-checkpoint-legacy'){if(window.wenshuDesktop){try{window.wenshuDesktop.checkpoint('稿件版本：'+(getProject().drafts[0]?.title||''));toast('版本已保存，可在设置中恢复历史工作区');}catch(error){toast(error.message);}}else exportAll();}
  if(action==='export-delivery')exportDelivery(id);
  if(action==='export-draft')exportDraft();
  if(action==='export-project')exportProject(id);
  if(action==='template-create'){openNewProject(el.dataset.type);}
  if(action==='project-add')showAddMenu();
  if(action==='library-add')openLibraryAdd();
  if(action==='first-pending-claim'){const found=state.projects.find(p=>(p.claims||[]).some(c=>c.status!=='已核验'));if(found){openProject(found.id);activeProjectTab='claims';render();}else toast('目前没有待核验事实。');}
  if(action==='first-pending-asset'){const found=state.projects.find(p=>(p.assets||[]).some(a=>a.rights==='待确认'));if(found){openProject(found.id);activeProjectTab='assets';render();}else toast('目前没有待确认授权。');}
}
function touchProject(doRender=false) { const p=getProject();if(p)p.updatedAt=Date.now();if(!saveState())throw new Error('未保存，请先备份或重试');if(doRender)render(); }
function submitSource(e) { e.preventDefault();const fd=new FormData(e.currentTarget);const p=getProject();p.sources.unshift({id:uid('s'),title:fd.get('title').trim(),type:fd.get('type'),url:fd.get('url').trim(),notes:fd.get('notes').trim(),createdAt:Date.now()});touchProject();render();toast('资料已保存'); }
function addClaim(prefill='') {if(prefill){saveClaim(prefill);return;}openFormDialog({eyebrow:'事实核验',title:'添加核验事项',description:'写下需要核对的具体说法，再关联可靠来源。',submit:'添加核验项',fields:`<label class="field-label">事实陈述<textarea class="text-input textarea" name="text" rows="3" placeholder="例如：这座茶馆于1984年开业。" required></textarea></label>`,onSubmit:data=>{const text=data.get('text').trim();if(!text)return false;saveClaim(text);}});}
function saveClaim(text) {const p=getProject();p.claims.unshift({id:uid('c'),text:text.trim(),status:'待核验',sourceIds:[]});touchProject();activeProjectTab='claims';render();}
function addAsset() {openFormDialog({eyebrow:'素材管理',title:'登记一项素材',description:'先记录素材从哪里来，再确认它能否用于当前项目。',submit:'保存素材',fields:`<div class="form-grid"><label>素材名称<input name="name" class="text-input" placeholder="例如：茶馆门头照片" required></label><label>素材类型<select name="kind" class="text-input"><option>图片</option><option>音乐</option><option>视频</option><option>字体</option><option>引文</option><option>其他</option></select></label><label class="wide-field">素材来源<input name="source" class="text-input" placeholder="原作者、网址或拍摄情况"></label><label>使用位置<input name="location" class="text-input" placeholder="例如：文章头图"></label><label>署名要求<input name="credit" class="text-input" placeholder="如有，请按授权填写"></label></div>`,onSubmit:data=>{const name=data.get('name').trim();if(!name)return false;const p=getProject();p.assets.unshift({id:uid('a'),name,kind:data.get('kind'),rights:'待确认',source:data.get('source').trim(),credit:data.get('credit').trim(),location:data.get('location').trim()});touchProject();render();}});}
function linkSource(claimId){const p=getProject(),c=p.claims.find(c=>c.id===claimId);if(!p.sources.length){toast('请先添加资料');return;}const options=p.sources.flatMap(s=>[{value:s.id,label:s.title+'（整个来源）'},...(s.excerpts||[]).map(q=>({value:s.id+'/'+q.id,label:s.title+' · '+(q.location||'摘录')+' · '+q.text.slice(0,50)}))]);openFormDialog({title:'关联证据',description:'可关联整个来源，也可定位到具体摘录。关联不代表核验完成。',submit:'保存关联',fields:`<select name="evidence" class="text-input">${options.map(o=>`<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')}</select>`,onSubmit:data=>{const [sourceId,excerptId]=data.get('evidence').split('/');c.sourceIds=[...new Set([...c.sourceIds,sourceId])];c.evidence||=[];if(excerptId)c.evidence.push({sourceId,excerptId});c.status='待核验';touchProject();render();}});}

function selectedToClaim() {const text=document.getElementById('draftEditor')?.value;const start=document.getElementById('draftEditor')?.selectionStart,end=document.getElementById('draftEditor')?.selectionEnd;const selected=text?.slice(start,end);if(!selected){toast('先在稿件中选中一段需要核验的内容。');return;}addClaim(selected);}
function showAddMenu(){openFormDialog({eyebrow:'项目操作',title:'添加到项目',description:'选择你现在要整理的内容。',submit:'继续',fields:`<div class="add-choice-list"><label class="add-choice"><input type="radio" name="choice" value="source" checked><span>▧</span><span><strong>资料来源</strong><small>链接、采访、文件或笔记</small></span></label><label class="add-choice"><input type="radio" name="choice" value="draft"><span>▤</span><span><strong>新建稿件</strong><small>开始撰写或整理内容</small></span></label><label class="add-choice"><input type="radio" name="choice" value="claim"><span>◌</span><span><strong>核验事项</strong><small>记录需要确认的事实陈述</small></span></label><label class="add-choice"><input type="radio" name="choice" value="asset"><span>◈</span><span><strong>素材与授权</strong><small>登记素材来源与使用条件</small></span></label></div>`,onSubmit:data=>{const choice=data.get('choice');setTimeout(()=>{if(choice==='source'){activeProjectTab='sources';render();document.querySelector('[data-action="add-source"]')?.click();}if(choice==='draft'){activeProjectTab='draft';render();document.querySelector('[data-action="new-draft"]')?.click();}if(choice==='claim')addClaim();if(choice==='asset')addAsset();},0);}});}
function openLibraryAdd(){if(!state.projects.length){toast('请先创建一个项目，再添加资料或素材。');return;}openFormDialog({eyebrow:'素材档案',title:'选择项目',description:'资料和素材会归属于具体创作项目。',submit:'继续',fields:`<label class="field-label">添加到<select class="text-input" name="projectId">${state.projects.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')}</select></label><label class="field-label">添加类型<select class="text-input" name="kind"><option value="source">资料来源</option><option value="asset">素材与授权</option></select></label>`,onSubmit:data=>{const projectId=data.get('projectId'),kind=data.get('kind');setTimeout(()=>{openProject(projectId);activeProjectTab=kind==='asset'?'assets':'sources';render();document.querySelector(`[data-action="${kind==='asset'?'add-asset':'add-source'}"]`)?.click();},0);}});}
function openNewProject(type){pendingTemplate=type;document.getElementById('projectType').value=['短视频脚本'].includes(type)?'短视频':type==='播客单集'?'播客':type==='采访报道'?'图文文章':type==='文化活动记录'?'文化项目':'自由创作';document.getElementById('projectDialog').showModal();}
function exportProject(id){const p=state.projects.find(x=>x.id===id);if(!p)return;const payload={product:'文枢',exportedAt:new Date().toISOString(),project:p};download(`${safeName(p.name)}-文枢项目包.json`,JSON.stringify(payload,null,2),'application/json');toast('项目包已导出');}
function exportDraft(){const d=getProject().drafts[0];download(`${safeName(d.title)}.md`,`# ${d.title}\n\n${d.content}`,'text/markdown;charset=utf-8');toast('稿件已导出');}
async function exportAll(){try{if(await window.wenshuDesktop.backup(JSON.stringify(state))){toast('外部备份已保存');refreshDesktopInfo();}}catch(error){toast('备份失败：'+error.message);}}
function download(name,content,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function safeName(s){return s.replace(/[\\/:*?"<>|]/g,'-').slice(0,50)||'创作项目';}
function templateDraft(type,now){const outlines={'采访报道':'## 选题与核心问题\n\n## 采访对象与背景\n\n## 现场记录\n\n## 事实与引文待核验\n\n## 初稿','短视频脚本':'## 一句话主题\n\n## 开场（前 3 秒）\n\n## 画面与旁白\n\n## 关键信息与来源\n\n## 结尾与行动引导','播客单集':'## 本期主题\n\n## 嘉宾与背景\n\n## 开场\n\n## 章节结构\n\n## 待确认的事实与素材\n\n## 收尾','文化活动记录':'## 活动信息\n\n## 核心观察\n\n## 采访与引用\n\n## 图片、音乐与授权\n\n## 发布安排'};if(!outlines[type])return [];return [{id:uid('d'),title:`${type} · 工作提纲`,channel:'主稿',content:outlines[type],updatedAt:now}];}

document.getElementById('projectForm').addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget),now=Date.now();const p={id:uid('p'),name:fd.get('name').trim(),type:fd.get('type'),description:fd.get('description').trim(),status:'准备中',createdAt:now,updatedAt:now,sources:[],claims:[],assets:[],drafts:templateDraft(pendingTemplate,now),checklist:[]};if(state.isDemo)state.projects=[];state.projects.unshift(p);state.isDemo=false;pendingTemplate=null;if(!saveState())return;document.getElementById('projectDialog').close();e.currentTarget.reset();openProject(p.id);toast('项目已创建');});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.close==='projectDialog')pendingTemplate=null;document.getElementById(b.dataset.close).close();}));
document.querySelectorAll('.nav-item[data-page]').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.page)));
document.getElementById('newProjectBtn').addEventListener('click',()=>document.getElementById('projectDialog').showModal());
document.getElementById('settingsBtn').addEventListener('click',()=>document.getElementById('settingsDialog').showModal());
document.getElementById('profileQuickBtn').addEventListener('click',()=>setPage('profile'));
document.getElementById('aiAssistantBtn').addEventListener('click',()=>{if(!getProject()){setPage('projects');toast('先打开一个创作项目，再使用 AI 助手。');return;}activeProjectTab='draft';render();openAiAssistant();});
document.getElementById('exportBackup').addEventListener('click',exportAll);
document.getElementById('importBackup').closest('label').replaceWith(Object.assign(document.createElement('button'),{id:'importDesktopBackup',className:'button secondary',textContent:'导入工作区备份'}));
document.getElementById('importDesktopBackup').onclick=async()=>{try{if(!flushSave())return;const imported=await window.wenshuDesktop.importBackup();if(!imported)return;openConfirmDialog({title:'替换当前工作区？',description:`备份包含 ${imported.projects.length} 个项目。导入前保存当前工作区恢复点。`,confirmLabel:'备份并导入',onConfirm:()=>{window.wenshuDesktop.checkpoint('导入备份前');const previous=state;state=validateBackup(imported);if(!saveState()){state=previous;throw new Error('导入保存失败，已保留原工作区');}activeProjectId=null;activePage='home';render();toast('备份已导入');}});}catch(error){toast(error.message);}};
document.getElementById('clearData').addEventListener('click',()=>openConfirmDialog({title:'清空工作区？',description:'先保存恢复点，再清空当前项目。历史备份仍保留，可通过工作区恢复找回。',confirmLabel:'保存恢复点并清空',danger:true,onConfirm:()=>{if(!flushSave())throw new Error('请先处理保存失败');window.wenshuDesktop.checkpoint('清空前');const previous=state;state={projects:[],trash:[],profile:{...DEFAULT_PROFILE},schemaVersion:2};if(!saveState()){state=previous;throw new Error('清空未保存');}activePage='home';activeProjectId=null;render();toast('工作区已清空，恢复点已保留');}}));
document.getElementById('searchBtn').addEventListener('click',()=>{document.getElementById('searchDialog').showModal();document.getElementById('searchInput').focus();});
document.getElementById('searchInput').addEventListener('input',e=>{const q=e.target.value.trim().toLowerCase();const results=state.projects.filter(p=>`${p.name} ${p.description}`.toLowerCase().includes(q));document.getElementById('searchResults').innerHTML=q?results.map(p=>`<button class="search-result" data-search-id="${escapeHtml(p.id)}"><span class="type-mark">${icon(p.type)}</span><span><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.description)}</small></span><b>↗</b></button>`).join('')||'<p class="muted-paragraph">没有找到相关项目</p>':'';document.querySelectorAll('[data-search-id]').forEach(b=>b.addEventListener('click',()=>{document.getElementById('searchDialog').close();openProject(b.dataset.searchId);}));});
document.getElementById('helpBtn').addEventListener('click',()=>document.getElementById('guideDialog').showModal());
document.querySelectorAll('[data-close-ai]').forEach(button=>button.addEventListener('click',()=>document.getElementById('aiDialog').close()));
document.getElementById('aiAssistantForm').addEventListener('submit',runAiTask);
document.getElementById('aiTask').addEventListener('change',syncAiTaskDescription);
document.getElementById('aiInput').addEventListener('input',()=>{document.getElementById('aiConsent').checked=false;document.getElementById('aiCharCount').textContent=document.getElementById('aiInput').value.length.toLocaleString()+' / 20,000';syncAiTaskDescription();});
document.getElementById('aiCopyResult').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(document.getElementById('aiResult').value);toast('建议已复制。');}catch{toast('系统未允许复制，请手动选择结果文本。');}});
document.getElementById('aiApplyResult').addEventListener('click',applyAiResult);
document.getElementById('saveAiAccessToken').addEventListener('click',()=>{const value=document.getElementById('aiAccessToken').value.trim();if(!refreshAiAccessToken(value)){toast('桌面工作区无法临时保存口令。');return;}toast(value?'口令已临时保存在当前标签页。':'已清除访问口令。');refreshAiStatus();});
document.getElementById('clearAiAccessToken').addEventListener('click',()=>{refreshAiAccessToken('');document.getElementById('aiAccessToken').value='';toast('访问口令已清除。');refreshAiStatus();});
document.getElementById('refreshAiStatus').addEventListener('click',refreshAiStatus);
document.getElementById('loadAiModels').addEventListener('click',loadAiModels);
document.getElementById('aiApiKey').addEventListener('input',()=>{configEpoch++;if(selectedProvider==='custom'){updateCustomConfig();return;}document.getElementById('aiModelSelect').replaceChildren(new Option('读取此 Key 对应的模型',''));document.getElementById('aiModelSelect').disabled=true;document.getElementById('saveAiConfig').disabled=true;document.getElementById('loadAiModels').disabled=!aiServiceStatus;document.getElementById('loadAiModels').textContent='读取模型';configNote('');});
document.getElementById('settingsDialog').addEventListener('close',()=>{if(!configSaving)selectProvider(selectedProvider);});
['aiBaseUrl','aiApiStyle','aiNoAuth','aiCustomModel'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{configEpoch++;configNote('');document.getElementById('loadAiModels').disabled=!aiServiceStatus;document.getElementById('loadAiModels').textContent='读取模型';if(id==='aiBaseUrl'||id==='aiApiStyle'||id==='aiNoAuth'){document.getElementById('aiApiKey').value='';document.getElementById('customModelOptions').replaceChildren();}updateCustomConfig();}));
renderProviderChoices();
document.getElementById('saveAiConfig').addEventListener('click',saveAiConfig);
document.getElementById('clearAiConfig').addEventListener('click',clearAiConfig);

document.querySelectorAll('[data-close-guide]').forEach(button=>button.addEventListener('click',()=>document.getElementById('guideDialog').close()));
document.getElementById('guideDialog').addEventListener('click',event=>{if(event.target===event.currentTarget)event.currentTarget.close();});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.getElementById('searchDialog').showModal();document.getElementById('searchInput').focus();}});

render();








refreshAiStatus();


window.addEventListener('beforeunload',event=>{if(unsavedWork&&!flushSave()){event.preventDefault();event.returnValue='仍有未保存修改';}});
window.addEventListener('error',event=>{if(event.error){event.preventDefault();toast(event.error.message||'操作失败');}});
window.addEventListener('unhandledrejection',event=>{event.preventDefault();toast(event.reason?.message||'操作失败');});
