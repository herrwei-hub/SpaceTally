import { contextBridge, ipcRenderer } from 'electron';
import type { ScanEvent } from '../shared/scan';

contextBridge.exposeInMainWorld('spaceTally', {
  chooseFolder: (): Promise<string | null> => ipcRenderer.invoke('folder:choose'),
  startScan: (rootPath: string): Promise<string> => ipcRenderer.invoke('scan:start', rootPath),
  cancelScan: (scanId: string): Promise<boolean> => ipcRenderer.invoke('scan:cancel', scanId),
  onScanEvent: (listener: (event: ScanEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ScanEvent): void => listener(payload);
    ipcRenderer.on('scan:event', handler);
    return () => ipcRenderer.removeListener('scan:event', handler);
  }
});
