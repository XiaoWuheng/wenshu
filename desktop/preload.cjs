const {contextBridge,ipcRenderer}=require('electron');
function call(channel,...args){const result=ipcRenderer.sendSync(channel,...args);if(!result.ok)throw new Error(result.error);return result.value;}
contextBridge.exposeInMainWorld('wenshuDesktop',Object.freeze({
  ready:()=>ipcRenderer.invoke('workspace:ready'),
  read:()=>call('workspace:read'),save:raw=>call('workspace:save',raw),saveAsync:raw=>ipcRenderer.invoke('workspace:save-async',raw),
  info:()=>call('workspace:info'),relocate:()=>ipcRenderer.invoke('workspace:relocate'),backup:raw=>ipcRenderer.invoke('workspace:backup',raw),importBackup:()=>ipcRenderer.invoke('workspace:import'),onboarded:()=>ipcRenderer.invoke('workspace:onboarded'),
  importSources:files=>ipcRenderer.invoke('tools:sources',files),preview:payload=>ipcRenderer.invoke('tools:preview',payload),exportDocument:payload=>ipcRenderer.invoke('tools:export',payload),diagnostics:()=>ipcRenderer.invoke('tools:diagnostics'),checkUpdates:repo=>ipcRenderer.invoke('tools:updates',repo),

  checkpoint:reason=>call('workspace:checkpoint',reason),history:()=>call('workspace:history'),
  restore:id=>call('workspace:restore',id),openFolder:()=>ipcRenderer.invoke('workspace:folder')
}));
