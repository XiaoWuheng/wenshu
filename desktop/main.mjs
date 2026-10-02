import { app, BrowserWindow, ipcMain, dialog, shell, Menu, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Workspace, atomic, validate, LIMIT } from './storage.mjs';
import { registerTools } from './tools.mjs';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
app.setName('Wenshu');
if(process.env.WENSHU_PROFILE_DIR)app.setPath('userData',path.resolve(process.env.WENSHU_PROFILE_DIR));
let mainWindow, origin, service;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if(mainWindow) { if(mainWindow.isMinimized())mainWindow.restore(); mainWindow.show(); mainWindow.focus(); } });
  app.whenReady().then(start).catch(error => { dialog.showErrorBox('文枢启动失败', error.message); app.quit(); });
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => service?.close());
async function start() {
  const preferencesFile=path.join(app.getPath('userData'),'preferences.json');
  fs.mkdirSync(app.getPath('userData'),{recursive:true});
  let preferences={};try{preferences=JSON.parse(fs.readFileSync(preferencesFile,'utf8'));}catch(error){if(error.code!=='ENOENT'){dialog.showMessageBoxSync({message:'数据目录配置损坏，请重新选择原工作区目录。',detail:'不会修改原工作区内容。'});const dirs=dialog.showOpenDialogSync({properties:['openDirectory']});if(!dirs){app.quit();return;}preferences.dataDir=dirs[0];}}
  let dataDir=preferences.dataDir||path.join(app.getPath('userData'),'workspace');
  let store;
  while(!store){try{if(preferences.dataDir&&!fs.existsSync(dataDir))throw new Error('指定目录不可用，可能移动磁盘未连接。');store=new Workspace(dataDir);const probe=path.join(dataDir,'.write-probe-'+Date.now());fs.writeFileSync(probe,'');fs.unlinkSync(probe);}catch(error){store=null;const choice=dialog.showMessageBoxSync({type:'warning',buttons:['重新选择已有工作区','退出'],message:'无法打开数据目录',detail:error.message+'\n不会自动创建空工作区覆盖你的选择。'});if(choice!==0){app.quit();return;}const dirs=dialog.showOpenDialogSync({properties:['openDirectory']});if(!dirs){app.quit();return;}dataDir=dirs[0];preferences.dataDir=dataDir;}}
  try{store.read();}catch(error){const history=store.history();const buttons=history.length?['恢复最近有效备份','选择外部备份','退出']:['选择外部备份','退出'];const choice=dialog.showMessageBoxSync({type:'error',buttons,defaultId:0,cancelId:buttons.length-1,message:'工作区读取失败',detail:'原文件将保留。'+(history.length?'最近有效备份：'+new Date(history[0].createdAt).toLocaleString():'未找到有效自动恢复点。')});if(history.length&&choice===0)store.restore(history[0].id,true);else if(choice===(history.length?1:0)){const files=dialog.showOpenDialogSync({title:'选择外部备份',properties:['openFile'],filters:[{name:'文枢备份',extensions:['json']}]});if(!files){app.quit();return;}if(fs.statSync(files[0]).size>LIMIT)throw new Error('备份超过 100 MB');const recovered=validate(fs.readFileSync(files[0],'utf8'));if(fs.existsSync(store.file))fs.copyFileSync(store.file,store.file+'.damaged-'+Date.now());atomic(store.file,JSON.stringify(recovered));}else{app.quit();return;}}
  const savePreferences=()=>atomic(preferencesFile,JSON.stringify(preferences));
  if(preferences.dataDir)savePreferences();
  const token=randomBytes(32).toString('hex');
  process.env.WENSHU_DESKTOP='1'; process.env.WENSHU_HOST='127.0.0.1'; process.env.WENSHU_PORT='0';
  process.env.WENSHU_DATA_DIR=dataDir; process.env.WENSHU_ACCESS_TOKEN=token;
  globalThis.wenshuConfigCodec={
    encode: value => { if(!safeStorage.isEncryptionAvailable())throw new Error('系统密钥保护不可用，暂时无法保存 AI 配置。'); return 'WENSHU1:'+safeStorage.encryptString(value).toString('base64'); },
    decode: value => { if(!value.startsWith('WENSHU1:'))throw new Error('桌面 AI 配置格式不正确。'); return safeStorage.decryptString(Buffer.from(value.slice(8),'base64')); }
  };
  const module=await import('../server.mjs');service=module.server;
  const port=await module.ready; origin=`http://127.0.0.1:${port}`;
  function trusted(event){return event.sender===mainWindow?.webContents&&event.senderFrame===mainWindow.webContents.mainFrame&&new URL(event.senderFrame.url).origin===origin;}
  function sync(channel,handler){ipcMain.on(channel,(event,...args)=>{try{if(!trusted(event))throw new Error('无权访问工作区');event.returnValue={ok:true,value:handler(...args)};}catch(error){event.returnValue={ok:false,error:error.message};}});}
  function handle(channel,handler){ipcMain.handle(channel,async(event,...args)=>{if(!trusted(event))throw new Error('无权访问工作区');return handler(...args);});}
  sync('workspace:read',()=>store.read());
  sync('workspace:save',raw=>store.save(raw));
  handle('workspace:save-async',raw=>store.save(raw));
  sync('workspace:checkpoint',reason=>store.snapshot(reason));
  sync('workspace:history',()=>store.history());
  sync('workspace:restore',id=>store.restore(id));
  sync('workspace:info',()=>({dataDir,limit:LIMIT,lastBackup:preferences.lastBackup||null,version:app.getVersion(),releaseRepo:preferences.releaseRepo||'',onboarded:Boolean(preferences.onboarded)}));
  handle('workspace:folder',()=>shell.openPath(dataDir));
  handle('workspace:onboarded',()=>{preferences.onboarded=true;savePreferences();});
  handle('workspace:relocate',async()=>{
    const result=await dialog.showOpenDialog(mainWindow,{title:'选择空文件夹存放文枢数据',properties:['openDirectory','createDirectory']});if(result.canceled)return false;
    const choice=await dialog.showMessageBox(mainWindow,{type:'question',buttons:['复制并切换','取消'],defaultId:1,cancelId:1,message:'复制数据并重新打开文枢？',detail:'原目录将保留。新目录必须为空。复制失败不会切换。'});if(choice.response!==0)return false;
    const destination=store.copyTo(result.filePaths[0]);preferences.dataDir=destination;savePreferences();app.relaunch();app.quit();return true;
  });
  handle('workspace:backup',async raw=>{validate(raw);const result=await dialog.showSaveDialog(mainWindow,{title:'导出外部备份',defaultPath:'文枢备份-'+new Date().toISOString().slice(0,10)+'.json',filters:[{name:'文枢备份',extensions:['json']}]});if(result.canceled)return false;atomic(result.filePath,raw);preferences.lastBackup=Date.now();savePreferences();return true;});
  handle('workspace:import',async()=>{const result=await dialog.showOpenDialog(mainWindow,{title:'选择工作区备份',filters:[{name:'文枢备份',extensions:['json']}],properties:['openFile']});if(result.canceled)return null;const file=result.filePaths[0];if(fs.statSync(file).size>LIMIT)throw new Error('备份超过 100 MB');return validate(fs.readFileSync(file,'utf8'));});
  handle('workspace:ready',()=>{if(process.env.WENSHU_SMOKE_REPORT&&process.env.WENSHU_PROFILE_DIR){atomic(process.env.WENSHU_SMOKE_REPORT,JSON.stringify({ready:true,version:app.getVersion(),platform:process.platform}));setTimeout(()=>app.quit(),200);}return true;});
  registerTools({handle,window:()=>mainWindow,store,preferences,savePreferences});
  mainWindow=new BrowserWindow({width:1320,height:900,minWidth:720,minHeight:520,title:'文枢',backgroundColor:'#f5f3ee',icon:path.join(root,'assets/icon-512.png'),show:false,webPreferences:{preload:path.join(root,'desktop/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,spellcheck:false}});
  mainWindow.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  mainWindow.webContents.session.setPermissionCheckHandler(()=>false);
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders({urls:[origin+'/*']},(details,callback)=>{details.requestHeaders.Authorization='Bearer '+token;callback({requestHeaders:details.requestHeaders});});
  function external(url){try{const parsed=new URL(url);if(['https:','http:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password)shell.openExternal(url);}catch{}}
  mainWindow.webContents.setWindowOpenHandler(({url})=>{external(url);return {action:'deny'};});
  mainWindow.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin){event.preventDefault();external(url);}});
  mainWindow.webContents.on('will-prevent-unload',event=>{const choice=dialog.showMessageBoxSync(mainWindow,{type:'warning',buttons:['返回并导出备份','仍然关闭'],defaultId:0,cancelId:0,message:'还有未成功保存的修改',detail:'关闭后可能丢失这些修改，请先导出备份。'});if(choice===1)event.preventDefault();});
  mainWindow.webContents.on('will-attach-webview',event=>event.preventDefault());
  mainWindow.webContents.on('render-process-gone',()=>dialog.showErrorBox('工作窗口意外停止','已成功保存的内容仍在应用数据目录。请重新打开文枢；必要时从自动恢复点恢复。'));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {label:'文枢',submenu:[{label:'打开数据文件夹',click:()=>shell.openPath(dataDir)},{type:'separator'},{label:'退出',role:'quit'}]},
    {label:'编辑',submenu:[{role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}]},
    {label:'视图',submenu:[{role:'resetZoom',label:'实际大小'},{role:'zoomIn',label:'放大'},{role:'zoomOut',label:'缩小'},{role:'togglefullscreen',label:'全屏'}]},
    {label:'帮助',submenu:[{label:'关于文枢',click:()=>dialog.showMessageBox(mainWindow,{title:'关于文枢',message:`文枢 ${app.getVersion()}`,detail:'本地优先的创作工作空间\n数据保存于本机；AI 仅发送你确认的文字。\n数据目录可在设置中指定；旧目录复制后保留。'})}]}
  ]));
  await mainWindow.loadURL(origin);if(!process.env.WENSHU_SMOKE_REPORT)mainWindow.show();
}
