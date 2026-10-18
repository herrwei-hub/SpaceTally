import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DirectoryNode, ScanProgress, ScanResult } from '../shared/scan';
import './style.css';
import './layout.css';
import './icon.css';
import brandIcon from '../../icons/concept-d-path.svg';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes;
  let index = -1;
  do { value /= 1024; index++; } while (value >= 1024 && index < units.length - 1);
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

function DirectoryRows({ node, parentSize, depth = 0 }: { node: DirectoryNode; parentSize: number; depth?: number }): React.ReactNode {
  const [open, setOpen] = useState(false);
  const percent = parentSize ? (node.sizeBytes / parentSize) * 100 : 0;
  return <>
    <div className="row" style={{ paddingLeft: `${16 + depth * 22}px` }}>
      <button className="folder-name" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="chevron">{node.children.length || node.directFileCount ? (open ? '⌄' : '›') : '·'}</span>
        <span>📁</span><span title={node.path}>{node.name}</span>
      </button>
      <strong>{formatBytes(node.sizeBytes)}</strong><span>{percent.toFixed(1)}%</span>
      <span>{node.fileCount.toLocaleString()}</span><span>{node.directoryCount.toLocaleString()}</span>
    </div>
    {open && <>
      {[...node.children].sort((a, b) => b.sizeBytes - a.sizeBytes).map(child =>
        <DirectoryRows key={child.id} node={child} parentSize={node.sizeBytes} depth={depth + 1} />)}
      {node.directFileCount > 0 && <div className="row file-row" style={{ paddingLeft: `${38 + depth * 22}px` }}>
        <span>📄 {depth === 0 ? '根目录文件' : '本目录文件'}</span>
        <strong>{formatBytes(node.directFileBytes)}</strong>
        <span>{node.sizeBytes ? (node.directFileBytes / node.sizeBytes * 100).toFixed(1) : '0.0'}%</span>
        <span>{node.directFileCount.toLocaleString()}</span><span>0</span>
      </div>}
    </>}
  </>;
}

function App(): React.ReactElement {
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [phase, setPhase] = useState<'idle' | 'scanning'>('idle');
  const [message, setMessage] = useState('');
  const activeId = useRef<string | null>(null); const lastFinishedId = useRef<string | null>(null);

  useEffect(() => window.spaceTally.onScanEvent(event => {
    const eventId = event.type === 'progress' ? event.progress.scanId : event.scanId;
    if (activeId.current && activeId.current !== eventId) return;
    if (!activeId.current) activeId.current = eventId;
    if (event.type === 'progress') setProgress(event.progress);
    if (event.type === 'completed') {
      setResult(event.result);
      setProgress(null);
      setPhase('idle');
      setMessage(event.result.skipped.total ? `扫描完成，跳过 ${event.result.skipped.total} 项；统计结果可能不完整。` : '扫描完成。');
      lastFinishedId.current = eventId; activeId.current = null;
    }
    if (event.type === 'cancelled' || event.type === 'failed') {
      setProgress(null);
      setPhase('idle');
      setMessage(event.type === 'cancelled' ? '本次扫描已取消，未保存部分结果。' : `扫描失败：${event.message}`);
      lastFinishedId.current = eventId; activeId.current = null;
    }
  }), []);

  async function choose(): Promise<void> {
    setMessage('');
    try {
      const selected = await window.spaceTally.chooseFolder();
      if (selected) setRootPath(selected);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '无法选择目录');
    }
  }

  async function start(): Promise<void> {
    if (!rootPath || phase === 'scanning') return;
    setMessage('');
    setProgress(null);
    setPhase('scanning'); lastFinishedId.current = null;
    try {
      const id = await window.spaceTally.startScan(rootPath);
      if (!activeId.current && lastFinishedId.current !== id) activeId.current = id;
    } catch (error) {
      setPhase('idle');
      setMessage(error instanceof Error ? error.message : '无法开始扫描');
    }
  }

  async function cancel(): Promise<void> {
    if (!activeId.current) return;
    try { await window.spaceTally.cancelScan(activeId.current); }
    catch (error) { setMessage(error instanceof Error ? error.message : '取消失败'); }
  }

  return <div className="shell">
    <aside className="sidebar">
      <div className="sidebar-brand"><img className="brand-icon" src={brandIcon} alt="" aria-hidden="true" /><strong>SpaceTally</strong></div>
      <div className="sidebar-group-label">工作区</div>
      <nav className="sidebar-nav" aria-label="主导航">
        <div className="nav-item active" aria-current="page"><span className="nav-icon">▥</span>空间概览</div>
        <div className="nav-item future"><span className="nav-icon">▤</span>大文件榜 <span className="soon">敬请期待</span></div>
        <div className="nav-item future"><span className="nav-icon">◷</span>扫描历史 <span className="soon">敬请期待</span></div>
      </nav>
      <div className="sidebar-footer"><strong>本地空间，一目了然。</strong><span>只分析文件，不修改文件。</span></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">SpaceTally <span>/</span> 空间概览</div><div className="topbar-actions"><span className="stage">核心扫描版</span><button className="secondary" disabled={phase === 'scanning'} onClick={choose}>＋ 选择目录</button></div></header>
    <main>
      <div className="heading"><div><div className="eyebrow">LOCAL DISK ANALYSIS</div><h2>分析一个本地目录</h2><p>统计文件逻辑大小，快速找到占用最大的目录和文件。</p></div></div>
      <section className="card picker"><div className="path"><span>当前目录</span><strong title={rootPath ?? ''}>{rootPath ?? '尚未选择目录'}</strong></div><button className="secondary" disabled={phase === 'scanning'} onClick={choose}>选择目录</button><button className="primary" disabled={!rootPath || phase === 'scanning'} onClick={start}>开始扫描</button></section>
      {phase === 'scanning' && <section className="card progress"><div className="progress-head"><div><h3>正在扫描</h3><p>已处理数量会持续更新；不估算完成百分比。</p></div><button className="secondary" onClick={cancel} disabled={!activeId.current}>取消扫描</button></div><div className="metrics"><div><span>文件</span><strong>{(progress?.fileCount ?? 0).toLocaleString()}</strong></div><div><span>目录</span><strong>{(progress?.directoryCount ?? 0).toLocaleString()}</strong></div><div><span>累计大小</span><strong>{formatBytes(progress?.sizeBytes ?? 0)}</strong></div><div><span>跳过项</span><strong>{progress?.skippedCount ?? 0}</strong></div></div><p className="current" title={progress?.currentPath}>{progress?.currentPath ?? '正在准备扫描…'}</p></section>}
      {message && <div className="message" role="status">{message}</div>}
      {result && <><div className="result-head"><div><h2>扫描结果</h2><p>{result.rootPath} · {new Date(result.completedAt).toLocaleString('zh-CN')}</p></div><span>快照 · 重新扫描后更新</span></div><div className="metrics result-metrics"><div><span>逻辑大小</span><strong>{formatBytes(result.root.sizeBytes)}</strong></div><div><span>文件</span><strong>{result.root.fileCount.toLocaleString()}</strong></div><div><span>子目录</span><strong>{result.root.directoryCount.toLocaleString()}</strong></div><div><span>跳过</span><strong>{result.skipped.total}</strong></div></div><section className="card table"><h3>目录结构</h3><div className="table-head"><span>名称</span><span>大小</span><span>占比</span><span>文件</span><span>子目录</span></div><DirectoryRows key={result.scanId} node={result.root} parentSize={result.root.sizeBytes} /></section><section className="card table"><h3>大文件榜</h3><div className="top-list">{result.topFiles.map((file, index) => <div className="top-file" key={file.path}><span className="rank">{String(index + 1).padStart(2, '0')}</span><div><strong>{file.name}</strong><small title={file.path}>{file.path}</small></div><b>{formatBytes(file.sizeBytes)}</b></div>)}</div></section>{result.skipped.total > 0 && <section className="card table"><h3>跳过项目</h3><p className="muted">最多展示前 100 项；其余项目仍计入总数。</p>{result.skipped.samples.map(item => <div className="skipped" key={item.path}><span>{item.reason}</span><span title={item.path}>{item.path}</span></div>)}</section>}</>}
    </main>
    </div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
