import { useEffect, useRef, useState } from 'react';
import { DirectoryEntry, errorMessage, listDirectory, ProjectInfo } from '../workspace';

interface Props {
  project: ProjectInfo;
  selectedPath: string | null;
  onOpen: (path: string) => void;
  onError: (message: string) => void;
}

export default function FileTree({ project, selectedPath, onOpen, onError }: Props) {
  const [directories, setDirectories] = useState<Record<string, DirectoryEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']));
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const mounted = useRef(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    mounted.current = true;
    void load('');
    return () => { mounted.current = false; };
  }, [project.id]);

  async function load(path: string) {
    setLoading(current => new Set(current).add(path));
    try {
      const entries = await listDirectory(project.id, path);
      if (mounted.current) setDirectories(current => ({ ...current, [path]: entries }));
    } catch (error) {
      if (mounted.current) onErrorRef.current(errorMessage(error));
    } finally {
      if (mounted.current) setLoading(current => { const next = new Set(current); next.delete(path); return next; });
    }
  }

  function toggle(path: string) {
    if (expanded.has(path)) {
      setExpanded(current => { const next = new Set(current); next.delete(path); return next; });
    } else {
      setExpanded(current => new Set(current).add(path));
      void load(path);
    }
  }

  function renderEntries(path: string, depth: number) {
    if (loading.has(path) && !directories[path]) return <li className="tree-hint" key={`${path}:loading`}>正在读取…</li>;
    const entries = directories[path];
    if (!entries) return <li className="tree-hint" key={`${path}:retry`}><button onClick={() => void load(path)}>重试读取</button></li>;
    if (entries.length === 0) return <li className="tree-hint" key={`${path}:empty`}>空文件夹</li>;
    return entries.map(entry => (
      <li key={entry.path}>
        <button
          className={`tree-entry${selectedPath === entry.path ? ' selected' : ''}`}
          style={{ paddingLeft: 12 + depth * 14 }}
          title={entry.path}
          aria-expanded={entry.isDirectory ? expanded.has(entry.path) : undefined}
          aria-current={!entry.isDirectory && selectedPath === entry.path ? 'page' : undefined}
          onClick={() => entry.isDirectory ? toggle(entry.path) : onOpen(entry.path)}
        >
          <span className="tree-icon" aria-hidden="true">{entry.isDirectory ? (expanded.has(entry.path) ? '▾' : '▸') : '·'}</span>
          <span className="truncate">{entry.name}</span>
        </button>
        {entry.isDirectory && expanded.has(entry.path) && <ul>{renderEntries(entry.path, depth + 1)}</ul>}
      </li>
    ));
  }

  return (
    <div className="file-tree">
      <div className="tree-project" title={project.root}>
        <span className="truncate">{project.name}</span>
        <button className="text-button" aria-label="刷新文件树" onClick={() => { setDirectories({}); setExpanded(new Set([''])); void load(''); }}>刷新</button>
      </div>
      <ul aria-label="项目文件">{renderEntries('', 0)}</ul>
    </div>
  );
}
