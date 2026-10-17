import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { OpenDocument } from '../workspace';

interface Props {
  document: OpenDocument;
  openPaths: string[];
  onChange: (path: string, content: string) => void;
}

const editorTheme = EditorView.theme({
  '&': { height: '100%', color: 'var(--text)', backgroundColor: 'var(--background)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'Consolas, "SFMono-Regular", monospace', fontSize: '14px', lineHeight: '1.65' },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--accent)' },
  '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--muted)', borderRight: '1px solid var(--border)' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--highlight)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--highlight)' },
  '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--text)' },
  '.cm-searchMatch': { backgroundColor: 'var(--highlight)', outline: '1px solid var(--accent)' },
});

export default function TextEditor({ document, openPaths, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const states = useRef(new Map<string, EditorState>());
  const onChangeRef = useRef(onChange);
  const applyingExternal = useRef(false);
  onChangeRef.current = onChange;

  useEffect(() => {
    const path = document.path;
    const previous = states.current.get(path);
    const editorState = previous?.doc.toString() === document.content ? previous : EditorState.create({
      doc: document.content,
      extensions: [
        basicSetup,
        editorTheme,
        EditorView.contentAttributes.of({ 'aria-label': '文本编辑器', spellcheck: 'false' }),
        EditorView.updateListener.of(update => {
          if (update.docChanged && !applyingExternal.current) onChangeRef.current(path, update.state.doc.toString());
        }),
      ],
    });
    const editor = new EditorView({ state: editorState, parent: host.current! });
    view.current = editor;
    editor.focus();
    return () => {
      states.current.set(path, editor.state);
      editor.destroy();
      view.current = null;
    };
  }, [document.path]);

  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== document.content) {
      applyingExternal.current = true;
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: document.content }, selection: { anchor: 0 } });
      applyingExternal.current = false;
    }
  }, [document.path, document.content]);

  useEffect(() => {
    for (const path of states.current.keys()) if (!openPaths.includes(path)) states.current.delete(path);
  }, [openPaths]);

  return <div className="text-editor" ref={host} />;
}
