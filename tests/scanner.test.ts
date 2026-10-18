import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scanDirectory, ScanCancelledError } from '../src/main/scanner';

async function fixture(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'spacetally-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test('aggregates nested directories and keeps the global largest twenty files', async () => fixture(async root => {
  await mkdir(path.join(root, 'nested'));
  await writeFile(path.join(root, 'root.bin'), Buffer.alloc(7));
  for (let i = 1; i <= 25; i++) await writeFile(path.join(root, 'nested', `file-${i}.bin`), Buffer.alloc(i));
  const progress: number[] = [];
  const result = await scanDirectory(root, { progressEveryFiles: 1, progressIntervalMs: 0, onProgress: p => progress.push(p.fileCount) });
  const nested = result.root.children[0];
  assert.equal(result.root.fileCount, 26);
  assert.equal(result.root.directoryCount, 1);
  assert.equal(result.root.directFileCount, 1);
  assert.equal(result.root.directFileBytes, 7);
  assert.equal(nested.fileCount, 25);
  assert.equal(nested.sizeBytes, 325);
  assert.equal(result.root.sizeBytes, 332);
  assert.equal(result.topFiles.length, 20);
  assert.equal(result.topFiles[0].sizeBytes, 25);
  assert.equal(result.topFiles.at(-1)?.sizeBytes, 7);
  assert.equal(progress.at(-1), 26);
  assert.equal(result.skipped.total, 0);
}));

test('empty directory has zero counts and still reports final progress', async () => fixture(async root => {
  const updates: number[] = [];
  const result = await scanDirectory(root, { onProgress: p => updates.push(p.directoryCount) });
  assert.equal(result.root.sizeBytes, 0);
  assert.equal(result.root.fileCount, 0);
  assert.equal(result.root.directoryCount, 0);
  assert.deepEqual(result.topFiles, []);
  assert.equal(updates.at(-1), 1);
}));

test('cancellation discards the in-progress result', async () => fixture(async root => {
  for (let i = 0; i < 5; i++) await writeFile(path.join(root, `${i}.bin`), 'x');
  const controller = new AbortController();
  await assert.rejects(scanDirectory(root, {
    signal: controller.signal,
    progressEveryFiles: 1,
    progressIntervalMs: 0,
    onProgress: p => { if (p.fileCount === 1) controller.abort(); }
  }), ScanCancelledError);
}));

test('a directory link is skipped instead of followed', async t => fixture(async root => {
  const outside = await mkdtemp(path.join(os.tmpdir(), 'spacetally-outside-'));
  try {
    await writeFile(path.join(outside, 'secret.bin'), Buffer.alloc(100));
    try { await symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) { t.skip(`symlink unavailable: ${String(error)}`); return; }
    const result = await scanDirectory(root);
    assert.equal(result.root.sizeBytes, 0);
    assert.equal(result.root.directoryCount, 0);
    assert.equal(result.skipped.byReason['reparse-point'] + result.skipped.byReason['outside-root'], 1);
  } finally { await rm(outside, { recursive: true, force: true }); }
}));
