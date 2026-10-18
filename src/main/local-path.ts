import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const execFileAsync = promisify(execFile);

/** Reject unsupported Windows path families and mapped/network drives. */
export async function assertLocalPath(selectedPath: string): Promise<void> {
  if (process.platform !== 'win32') return;
  const normalized = path.win32.normalize(selectedPath);
  if (normalized.startsWith('\\\\') || normalized.startsWith('\\\\?\\') || normalized.startsWith('\\\\.\\')) {
    throw new Error('暂不支持网络或设备路径');
  }
  const drive = /^[A-Za-z]:\\/.exec(normalized)?.[0].slice(0, 2);
  if (!drive) throw new Error('请选择本地磁盘中的目录');
  // The drive letter is regex constrained before inserting it into the command.
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    `(Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${drive}'").DriveType`
  ], { windowsHide: true, timeout: 10000 });
  if (!([2,3].includes(Number(stdout.trim())))) throw new Error('暂不支持网络或非固定磁盘路径');
}
