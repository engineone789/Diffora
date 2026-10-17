import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { errorMessage, readMarkdownImage } from '../workspace';

function LocalImage({ projectId, path, src, alt, title }: { projectId: number; path: string; src?: string; alt?: string; title?: string }) {
  const [result, setResult] = useState<{ key: string; url?: string; error?: string }>();
  const key = JSON.stringify([projectId, path, src]);
  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        if (!src || /^(?:[a-z][a-z\d+.-]*:|[\\/])/i.test(src)) throw new Error('仅支持项目内的相对路径图片。');
        const bytes = await readMarkdownImage(projectId, path, decodeURIComponent(src.split(/[?#]/)[0]));
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        if (!disposed) setResult({ key, url: `data:image/${bytes[0] === 0x89 ? 'png' : bytes[0] === 0xff ? 'jpeg' : bytes[0] === 0x47 ? 'gif' : 'webp'};base64,${btoa(binary)}` });
      } catch (error) {
        if (!disposed) setResult({ key, error: errorMessage(error) });
      }
    })();
    return () => { disposed = true; };
  }, [projectId, path, src, key]);
  if (result?.key !== key) return <span className="image-placeholder">正在加载图片：{alt || src}</span>;
  if (!result.url) return <span className="image-placeholder" role="status" title={result.error}>图片不可用：{alt || src}（{result.error}）</span>;
  return <img src={result.url} alt={alt || ''} title={title} onError={() => setResult({ key, error: '图片内容无法解码。' })} />;
}

export default function MarkdownPreview({ projectId, path, content }: { projectId: number; path: string; content: string }) {
  const deferredContent = useDeferredValue(content);
  const components = useMemo(() => ({
    img: ({ src, alt, title }: { src?: string; alt?: string; title?: string }) => <LocalImage projectId={projectId} path={path} src={src} alt={alt} title={title} />,
    a: ({ href, children }: React.ComponentProps<'a'>) => <a title={href} onClick={event => event.preventDefault()}>{children}</a>,
  }), [projectId, path]);
  return <article className="markdown-preview" aria-label="Markdown 预览">
    <Markdown remarkPlugins={[remarkGfm]} skipHtml components={components}>{deferredContent}</Markdown>
  </article>;
}
