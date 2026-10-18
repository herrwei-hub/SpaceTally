import type { ScanEvent } from '../shared/scan';

export {};

declare global {
  interface Window {
    spaceTally: {
      chooseFolder(): Promise<string | null>;
      startScan(rootPath: string): Promise<string>;
      cancelScan(scanId: string): Promise<boolean>;
      onScanEvent(listener: (event: ScanEvent) => void): () => void;
    };
  }
}
