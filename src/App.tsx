import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import FileTree from './components/FileTree';
import {
  checkDocuments, chooseProject, closeDocument, errorCode, errorMessage, fileName,
  isDirty, OpenDocument, ProjectInfo, readDocument, saveDocument,
} from './workspace';

type Theme = 'system' | 'light' | 'dark';
const TextEditor = lazy(() => import('./components/TextEditor'));
type Panel = 'files' | 'git';
type PendingAction = { kind: 'tab' | 'reload'; path: string } | { kind: 'project' | 'window' };

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('diffora.theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage can be unavailable; system theme remains usable.
  }
  return 'system';
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [panel, setPanel] = useState<Panel>('files');
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [documents, setDocuments] = useState<OpenDocument[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const projectRef = useRef(project);
  const documentsRef = useRef(documents);
  const activePathRef = useRef(activePath);
  const opening = useRef(new Set<string>());
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const requestCloseRef = useRef<() => void>(() => {});
  const activeDocument = documents.find(document => document.path === activePath);

  projectRef.current = project;
  activePathRef.current = activePath;
  requestCloseRef.current = () => { void requestAction({ kind: 'window' }); };

  function updateDocuments(update: (current: OpenDocument[]) => OpenDocument[]) {
    const next = update(documentsRef.current);
    documentsRef.current = next;
    setDocuments(next);
  }

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    apply();
    media.addEventListener('change', apply);
    try {
      localStorage.setItem('diffora.theme', theme);
    } catch {
      // Theme switching still works without persistence.
    }
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(event => {
      event.preventDefault();
      requestCloseRef.current();
    }).then(stop => { if (disposed) stop(); else unlisten = stop; })
      .catch(error => { if (!disposed) setNotice(errorMessage(error)); });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  useEffect(() => {
    const check = () => { void refreshDiskChanges(); };
    const checkVisible = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', checkVisible);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', checkVisible);
    };
  }, []);

  useEffect(() => {
    const saveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (activePath && !pendingAction && !busy) void saveOne(activePath).catch(() => {});
      }
    };
    window.addEventListener('keydown', saveShortcut);
    return () => window.removeEventListener('keydown', saveShortcut);
  }, [activePath, pendingAction, busy]);

  useEffect(() => {
    const dialog = confirmDialog.current;
    if (!dialog) return;
    if (pendingAction && !dialog.open) dialog.showModal();
    if (!pendingAction && dialog.open) dialog.close();
  }, [pendingAction]);

  async function refreshDiskChanges() {
    const currentProject = projectRef.current;
    if (!currentProject || documentsRef.current.length === 0) return;
    try {
      const changes = await checkDocuments(currentProject.id);
      if (projectRef.current?.id !== currentProject.id) return;
      updateDocuments(current => current.map(document => ({
        ...document, diskStatus: changes.find(change => change.path === document.path)?.status,
      })));
    } catch (error) {
      if (projectRef.current?.id === currentProject.id) setNotice(errorMessage(error));
    }
  }

  async function openFile(path: string) {
    const currentProject = projectRef.current;
    if (!currentProject || busy) return;
    if (documentsRef.current.some(document => document.path === path)) { setActivePath(path); return; }
    if (opening.current.has(path)) return;
    opening.current.add(path);
    try {
      const document = await readDocument(currentProject.id, path);
      if (projectRef.current?.id !== currentProject.id) return;
      updateDocuments(current => current.some(item => item.path === document.path) ? current : [
        ...current, { ...document, savedContent: document.content, saving: false },
      ]);
      setActivePath(document.path);
      setNotice('');
    } catch (error) {
      if (projectRef.current?.id === currentProject.id) setNotice(errorMessage(error));
    } finally { opening.current.delete(path); }
  }

  async function saveOne(path: string) {
    const currentProject = projectRef.current;
    const document = documentsRef.current.find(item => item.path === path);
    if (!currentProject || !document || !isDirty(document)) return;
    if (document.saving) throw new Error('文件正在保存，请稍后再试。');
    const content = document.content;
    updateDocuments(current => current.map(item => item.path === path ? { ...item, saving: true } : item));
    try {
      await saveDocument(currentProject.id, path, content);
      if (projectRef.current?.id !== currentProject.id) return;
      updateDocuments(current => current.map(item => item.path === path ? {
        ...item, savedContent: content, saving: false, diskStatus: undefined,
      } : item));
      setNotice(`已保存 ${fileName(path)}`);
    } catch (error) {
      if (projectRef.current?.id === currentProject.id) {
        updateDocuments(current => current.map(item => item.path === path ? {
          ...item, saving: false, diskStatus: errorCode(error) === 'external_change' ? 'changed' : item.diskStatus,
        } : item));
        setNotice(errorMessage(error));
      }
      throw error;
    }
  }

  function affectedDocuments(action: PendingAction) {
    return documentsRef.current.filter(document =>
      isDirty(document) && (!('path' in action) || action.path === document.path));
  }

  async function performAction(action: PendingAction) {
    const currentProject = projectRef.current;
    setBusy(true);
    try {
      if (action.kind === 'project') {
        const selected = await chooseProject();
        if (selected) {
          projectRef.current = selected;
          setProject(selected);
          updateDocuments(() => []);
          setActivePath(null);
          setPanel('files');
          setNotice('');
        }
      } else if (action.kind === 'window') {
        await getCurrentWindow().destroy();
      } else if (currentProject && action.kind === 'tab') {
        await closeDocument(currentProject.id, action.path);
        const previous = documentsRef.current;
        const index = previous.findIndex(document => document.path === action.path);
        const remaining = previous.filter(document => document.path !== action.path);
        updateDocuments(() => remaining);
        if (activePathRef.current === action.path) setActivePath(remaining[Math.min(index, remaining.length - 1)]?.path ?? null);
      } else if (currentProject && action.kind === 'reload') {
        const document = await readDocument(currentProject.id, action.path);
        updateDocuments(current => current.map(item => item.path === action.path ? {
          ...document, savedContent: document.content, saving: false,
        } : item));
        setNotice(`已重新加载 ${fileName(action.path)}`);
      }
    } finally { setBusy(false); }
  }

  async function requestAction(action: PendingAction) {
    if (busy || confirmBusy) return;
    if (documentsRef.current.some(document => document.saving)) {
      setNotice('文件正在保存，请稍后再试。');
      return;
    }
    if (affectedDocuments(action).length > 0) { setPendingAction(action); return; }
    try { await performAction(action); } catch (error) { setNotice(errorMessage(error)); }
  }

  async function confirmAction(save: boolean) {
    if (!pendingAction || confirmBusy) return;
    setConfirmBusy(true);
    try {
      if (save) for (const document of affectedDocuments(pendingAction)) await saveOne(document.path);
      await performAction(pendingAction);
      setPendingAction(null);
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setConfirmBusy(false); }
  }

  return (
    <div className="app-shell">
      <header className="app-header flex items-center justify-between gap-4 px-5">
        <div className="flex items-center gap-3">
          <span className="brand-mark" aria-hidden="true">D</span>
          <span className="font-semibold tracking-wide">Diffora</span>
          <span className="header-caption">轻量文件编辑器</span>
        </div>
        <div className="header-actions">
          <button className="primary-button" disabled={busy || !isTauri()} onClick={() => void requestAction({ kind: 'project' })}>
            {busy ? '正在处理…' : project ? '切换文件夹' : '打开文件夹'}
          </button>
          <label className="flex items-center gap-2 text-xs">
          <span className="muted">主题</span>
          <select value={theme} onChange={event => setTheme(event.target.value as Theme)}>
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
          </label>
        </div>
      </header>

      <div className="workspace">
        <nav className="activity-bar flex flex-col items-center gap-3 py-4" aria-label="工作区视图">
          <button className="activity-button" aria-label="文件" title="文件" aria-pressed={panel === 'files'} onClick={() => setPanel('files')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 4h7l2 3h7v13H4z" /></svg>
          </button>
          <button className="activity-button" aria-label="Git 变更" title="Git 变更" aria-pressed={panel === 'git'} onClick={() => setPanel('git')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="7" cy="5" r="2"/><circle cx="7" cy="19" r="2"/><circle cx="17" cy="6" r="2"/><path d="M7 7v10m10-9v2c0 3-10 2-10 6"/></svg>
          </button>
        </nav>

        <aside className="sidebar">
          <div className="panel-heading">{panel === 'files' ? '文件资源管理器' : '源代码管理'}</div>
          {panel === 'files' && project ? <FileTree key={project.id} project={project} selectedPath={activePath} onOpen={path => void openFile(path)} onError={setNotice} /> : <div className="p-5 text-sm leading-7">
            <p>{panel === 'files' ? '尚未打开文件夹' : '尚未打开 Git 项目'}</p>
            <p className="muted mt-2 text-xs leading-6">
              {panel === 'files' ? '打开本地项目后，文件和文件夹将在这里显示。' : '这里将展示工作区与暂存区变更，仅提供状态与差异查看。'}
            </p>
          </div>}
        </aside>

        <main className="editor-area">
          {notice && <div className="notice" role="status"><span>{notice}</span><button className="text-button" aria-label="关闭提示" onClick={() => setNotice('')}>×</button></div>}
          {documents.length > 0 && <div className="tab-bar" role="tablist" aria-label="打开的文件">
            {documents.map(document => <div className={`file-tab${document.path === activePath ? ' active' : ''}`} key={document.path}>
              <button role="tab" aria-selected={document.path === activePath} title={document.path} onClick={() => setActivePath(document.path)}>
                {fileName(document.path)}{isDirty(document) && <span className="dirty-mark" aria-label="未保存">●</span>}
              </button>
              <button className="tab-close" aria-label={`关闭 ${fileName(document.path)}`} onClick={() => void requestAction({ kind: 'tab', path: document.path })}>×</button>
            </div>)}
          </div>}
          {activeDocument ? <>
            <div className="editor-toolbar"><span className="truncate" title={activeDocument.path}>{activeDocument.path}</span>
              <button className="primary-button" title="保存（Ctrl／⌘ + S）" disabled={busy || activeDocument.saving || !isDirty(activeDocument)} onClick={() => void saveOne(activeDocument.path).catch(() => {})}>{activeDocument.saving ? '保存中…' : '保存'}</button>
            </div>
            {activeDocument.diskStatus && <div className="external-change" role="alert">
              <span>{activeDocument.diskStatus === 'missing' ? '磁盘文件已被删除或移动。' : activeDocument.diskStatus === 'unreadable' ? '磁盘文件无法读取，请检查文件及权限。' : '磁盘文件已被其他程序修改。'}{isDirty(activeDocument) ? '本地修改仍保留，请处理冲突后保存。' : '请重新加载最新内容。'}</span>
              <button className="text-button" disabled={busy || activeDocument.diskStatus === 'missing'} onClick={() => void requestAction({ kind: 'reload', path: activeDocument.path })}>重新加载</button>
            </div>}
            <Suspense fallback={<p className="tree-hint">正在加载编辑器…</p>}><TextEditor document={activeDocument} openPaths={documents.map(document => document.path)} onChange={(path, content) => updateDocuments(current => current.map(document => document.path === path ? { ...document, content } : document))} /></Suspense>
          </> : <>
          <div className="panel-heading">{project ? project.name : '欢迎使用'}</div>
          <div className="welcome">
            <div className="welcome-content">
              <span className="eyebrow">DIFFORA / 工作空间</span>
              <h1>专注文件，<br />看清每一次变化。</h1>
              <p className="muted mt-5 max-w-md text-sm leading-7">为本地文本编辑、Markdown 阅读与 Git 差异查看准备的轻量工作空间。</p>
              <div className="feature-list mt-10">
                <div><span>01</span><p>文本编辑<small>文件树、标签页与本地保存</small></p></div>
                <div><span>02</span><p>Markdown<small>源码编辑、预览与分屏阅读</small></p></div>
                <div><span>03</span><p>Git Diff<small>只读查看工作区与暂存区差异</small></p></div>
              </div>
              <p className="stage-note mt-10">{project ? '从左侧选择文本文件开始编辑，使用 Ctrl／⌘ + S 保存。' : isTauri() ? '打开本地文件夹，开始编辑 UTF-8 文本。Markdown 预览与 Git Diff 将在后续阶段接入。' : '请启动 Diffora 桌面程序以访问本地文件。'}</p>
            </div>
          </div>
          </>}
        </main>
      </div>
      <footer className="status-bar flex items-center justify-between px-4 text-xs">
        <span className="truncate" title={project?.root}>Diffora <span className="muted">/ {project?.root || '未打开项目'}</span></span>
        <span className="muted status-detail">{activeDocument ? `UTF-8${activeDocument.hasBom ? ' BOM' : ''} · ${activeDocument.lineEnding} · ${isDirty(activeDocument) ? '未保存' : '已保存'}` : '文件编辑 · 0.1.0'}</span>
      </footer>
      <dialog className="confirm-dialog" ref={confirmDialog} aria-labelledby="confirm-title" onCancel={event => { event.preventDefault(); if (!confirmBusy) setPendingAction(null); }}>
        <h2 id="confirm-title">{pendingAction?.kind === 'reload' ? '重新加载磁盘文件？' : '有尚未保存的修改'}</h2>
        <p>{pendingAction?.kind === 'reload' ? '重新加载会放弃此文件的本地修改。' : '继续前请选择保存或放弃修改，也可以取消操作。'}</p>
        <ul>{pendingAction && affectedDocuments(pendingAction).map(document => <li key={document.path}>{document.path}</li>)}</ul>
        {notice && <p className="dialog-notice" role="status">{notice}</p>}
        <div className="dialog-actions">
          <button className="secondary-button" disabled={confirmBusy} onClick={() => setPendingAction(null)}>取消</button>
          <button className="secondary-button" disabled={confirmBusy} onClick={() => void confirmAction(false)}>{pendingAction?.kind === 'reload' ? '放弃修改并重新加载' : '放弃更改'}</button>
          {pendingAction?.kind !== 'reload' && <button className="primary-button" disabled={confirmBusy} onClick={() => void confirmAction(true)}>{confirmBusy ? '处理中…' : '保存并继续'}</button>}
        </div>
      </dialog>
    </div>
  );
}
