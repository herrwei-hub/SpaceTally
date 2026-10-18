import { lstat, readdir, realpath } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { DirectoryNode, ScanProgress, ScanResult, SkipReason } from '../shared/scan';

export class ScanCancelledError extends Error {
  constructor() {
    super('扫描已取消');
    this.name = 'ScanCancelledError';
  }
}

export interface ScanOptions {
  scanId?: string;
  signal?: AbortSignal;
  onProgress?: (progress: ScanProgress) => void;
  progressEveryFiles?: number;
  progressIntervalMs?: number;
}

type TopFile = ScanResult['topFiles'][number];

// Keep only the twenty largest files. The smallest selected file is at index 0.
class TopFiles {
  private readonly heap: TopFile[] = [];

  add(file: TopFile): void {
    if (this.heap.length < 20) {
      this.heap.push(file);
      this.up(this.heap.length - 1);
    } else if (file.sizeBytes > this.heap[0].sizeBytes) {
      this.heap[0] = file;
      this.down(0);
    }
  }

  sorted(): TopFile[] {
    return [...this.heap].sort((a, b) => b.sizeBytes - a.sizeBytes || a.path.localeCompare(b.path));
  }

  private up(index: number): void {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[parent].sizeBytes <= this.heap[index].sizeBytes) break;
      [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
      index = parent;
    }
  }

  private down(index: number): void {
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.heap.length && this.heap[left].sizeBytes < this.heap[smallest].sizeBytes) smallest = left;
      if (right < this.heap.length && this.heap[right].sizeBytes < this.heap[smallest].sizeBytes) smallest = right;
      if (smallest === index) break;
      [this.heap[smallest], this.heap[index]] = [this.heap[index], this.heap[smallest]];
      index = smallest;
    }
  }
}

function canonical(value: string): string {
  const normalized = path.normalize(value).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized;
}

function isWithinRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function reasonFor(error: unknown): SkipReason {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === 'EACCES' || code === 'EPERM' ? 'permission' : 'read-error';
}

export async function scanDirectory(requestedRoot: string, options: ScanOptions = {}): Promise<ScanResult> {
  if (!path.isAbsolute(requestedRoot)) throw new Error('扫描目录必须是绝对路径');
  const scanId = options.scanId ?? randomUUID();
  const startedAt = new Date().toISOString();
  const signal = options.signal;
  const checkCancelled = (): void => {
    if (signal?.aborted) throw new ScanCancelledError();
  };
  checkCancelled();
  const rootInput = path.resolve(requestedRoot);
  const rootStat = await lstat(rootInput);
  checkCancelled();
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('请选择普通本地目录');
  const rootPath = await realpath(rootInput);
  checkCancelled();
  const topFiles = new TopFiles();
  const skipped: ScanResult['skipped'] = {
    total: 0,
    byReason: { permission: 0, 'read-error': 0, 'reparse-point': 0, 'outside-root': 0 },
    samples: []
  };
  let filesSeen = 0;
  let directoriesSeen = 0;
  let bytesSeen = 0;
  let lastProgressAt = 0;
  let lastProgressFiles = 0;
  const progressEvery = Math.max(1, options.progressEveryFiles ?? 300);
  const progressInterval = Math.max(0, options.progressIntervalMs ?? 250);

  const report = (currentPath: string, force = false): void => {
    const now = Date.now();
    if (!force && filesSeen - lastProgressFiles < progressEvery && now - lastProgressAt < progressInterval) return;
    lastProgressAt = now;
    lastProgressFiles = filesSeen;
    options.onProgress?.({ scanId, currentPath, fileCount: filesSeen, directoryCount: directoriesSeen, sizeBytes: bytesSeen, skippedCount: skipped.total });
  };
  const skip = (entryPath: string, reason: SkipReason): void => {
    skipped.total++;
    skipped.byReason[reason]++;
    if (skipped.samples.length < 100) skipped.samples.push({ path: entryPath, reason });
    report(entryPath);
  };

  async function visit(directoryPath: string, isRoot: boolean): Promise<DirectoryNode> {
    checkCancelled();
    directoriesSeen++;
    report(directoryPath);
    const node: DirectoryNode = {
      id: path.relative(rootPath, directoryPath) || '.',
      name: path.basename(directoryPath) || directoryPath,
      path: directoryPath,
      sizeBytes: 0,
      fileCount: 0,
      directoryCount: 0,
      directFileCount: 0,
      directFileBytes: 0,
      children: []
    };
    let entries: string[];
    try {
      entries = await readdir(directoryPath);
    } catch (error) {
      checkCancelled();
      if (isRoot) throw error;
      skip(directoryPath, reasonFor(error));
      return node;
    }
    checkCancelled();
    for (const name of entries) {
      checkCancelled();
      const entryPath = path.join(directoryPath, name);
      let stat;
      try {
        stat = await lstat(entryPath);
      } catch (error) {
        checkCancelled();
        skip(entryPath, reasonFor(error));
        continue;
      }
      checkCancelled();
      if (stat.isSymbolicLink()) {
        skip(entryPath, 'reparse-point');
        continue;
      }
      if (stat.isDirectory()) {
        let resolved: string;
        try {
          resolved = await realpath(entryPath);
        } catch (error) {
          checkCancelled();
          skip(entryPath, reasonFor(error));
          continue;
        }
        checkCancelled();
        if (!isWithinRoot(resolved, rootPath)) {
          skip(entryPath, 'outside-root');
          continue;
        }
        if (canonical(resolved) !== canonical(entryPath)) {
          skip(entryPath, 'reparse-point');
          continue;
        }
        const child = await visit(entryPath, false);
        node.children.push(child);
        node.sizeBytes += child.sizeBytes;
        node.fileCount += child.fileCount;
        node.directoryCount += child.directoryCount + 1;
      } else if (stat.isFile()) {
        node.directFileCount++;
        node.directFileBytes += stat.size;
        node.sizeBytes += stat.size;
        node.fileCount++;
        filesSeen++;
        bytesSeen += stat.size;
        topFiles.add({ path: entryPath, name, sizeBytes: stat.size });
        report(entryPath);
      } else {
        skip(entryPath, 'reparse-point');
      }
    }
    return node;
  }

  const root = await visit(rootPath, true);
  checkCancelled();
  report(rootPath, true);
  return { scanId, rootPath, startedAt, completedAt: new Date().toISOString(), root, topFiles: topFiles.sorted(), skipped };
}
