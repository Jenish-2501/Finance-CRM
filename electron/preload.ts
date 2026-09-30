import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  store: {
    migrateLocalStorage: (data: any) => ipcRenderer.invoke('store:migrateLocalStorage', data),
    upsert: (entityType: string, data: any) => ipcRenderer.invoke('store:upsert', entityType, data),
    delete: (entityType: string, id: string) => ipcRenderer.invoke('store:delete', entityType, id),
    loadAll: () => ipcRenderer.invoke('store:loadAll'),
    persistChanges: (payload: Record<string, any[]>) => ipcRenderer.invoke('store:persistChanges', payload),
  },
  files: {
    saveCSV: (filename: string, content: string) => ipcRenderer.invoke('files:saveCSV', { filename, content }),
  }
});
