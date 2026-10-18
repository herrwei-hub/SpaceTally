import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { assertLocalPath } from './local-path';
import { scanDirectory, ScanCancelledError } from './scanner';
import type { ScanEvent } from '../shared/scan';

let window: BrowserWindow | null = null;
const authorizedRoots = new Set<string>();
let active: { id: string; controller: AbortController } | null = null;

function createWindow(): void {
  window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 780,
    minHeight: 570,
    title: 'SpaceTally',
    icon: path.join(app.getAppPath(), 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if ((process.env.npm_lifecycle_event === 'dev' ? 'http://127.0.0.1:5173' : null)) {
    void window.loadURL('http://127.0.0.1:5173');
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('SpaceTally');
  ipcMain.handle('folder:choose', async () => {
    const owner = window;
    if (!owner) throw new Error('窗口尚未就绪');
    const choice = await dialog.showOpenDialog(owner, {
      title: '选择要分析的本地目录',
      properties: ['openDirectory']
    });
    if (choice.canceled || !choice.filePaths[0]) return null;
    const selected = path.resolve(choice.filePaths[0]);
    await assertLocalPath(selected);
    authorizedRoots.add(selected);
    return selected;
  });

  ipcMain.handle('scan:start', (event, selectedPath: unknown) => {
    if (typeof selectedPath !== 'string' || !authorizedRoots.has(path.resolve(selectedPath))) {
      throw new Error('请先使用目录选择器授权扫描目录');
    }
    if (active) throw new Error('已有扫描正在进行');
    const scanId = randomUUID();
    const controller = new AbortController();
    active = { id: scanId, controller };
    const sender = event.sender;
    const send = (payload: ScanEvent): void => {
      if (!sender.isDestroyed()) sender.send('scan:event', payload);
    };
    void (async () => {
      try {
        await assertLocalPath(selectedPath);
        const result = await scanDirectory(selectedPath, {
          scanId,
          signal: controller.signal,
          onProgress: progress => send({ type: 'progress', progress })
        });
        send({ type: 'completed', scanId, result });
      } catch (error) {
        if (error instanceof ScanCancelledError || controller.signal.aborted) {
          send({ type: 'cancelled', scanId });
        } else {
          send({ type: 'failed', scanId, message: error instanceof Error ? error.message : '扫描失败' });
        }
      } finally {
        if (active?.id === scanId) active = null;
      }
    })();
    return scanId;
  });

  ipcMain.handle('scan:cancel', (_event, scanId: unknown) => {
    if (typeof scanId !== 'string' || active?.id !== scanId) return false;
    active.controller.abort();
    return true;
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  active?.controller.abort();
  if (process.platform !== 'darwin') app.quit();
});
