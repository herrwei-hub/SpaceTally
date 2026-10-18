export type SkipReason = 'permission' | 'read-error' | 'reparse-point' | 'outside-root';

export interface DirectoryNode {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  fileCount: number;
  directoryCount: number;
  directFileCount: number;
  directFileBytes: number;
  children: DirectoryNode[];
}

export interface ScanProgress {
  scanId: string;
  currentPath: string;
  fileCount: number;
  directoryCount: number;
  sizeBytes: number;
  skippedCount: number;
}

export interface ScanResult {
  scanId: string;
  rootPath: string;
  startedAt: string;
  completedAt: string;
  root: DirectoryNode;
  topFiles: Array<{ path: string; name: string; sizeBytes: number }>;
  skipped: {
    total: number;
    byReason: Record<SkipReason, number>;
    samples: Array<{ path: string; reason: SkipReason }>;
  };
}

export type ScanEvent =
  | { type: 'progress'; progress: ScanProgress }
  | { type: 'completed'; scanId: string; result: ScanResult }
  | { type: 'cancelled'; scanId: string }
  | { type: 'failed'; scanId: string; message: string };
