import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import mammoth from 'mammoth'
import hljs from 'highlight.js/lib/core'
import 'highlight.js/styles/github-dark.css'
// Curated language set — covers the vast majority of files without pulling
// highlight.js's full ~200-language bundle.
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import python from 'highlight.js/lib/languages/python'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import java from 'highlight.js/lib/languages/java'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import bash from 'highlight.js/lib/languages/bash'
import yaml from 'highlight.js/lib/languages/yaml'
import ini from 'highlight.js/lib/languages/ini'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import scss from 'highlight.js/lib/languages/scss'
import sql from 'highlight.js/lib/languages/sql'
import ruby from 'highlight.js/lib/languages/ruby'
import php from 'highlight.js/lib/languages/php'
import markdownLang from 'highlight.js/lib/languages/markdown'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import kotlin from 'highlight.js/lib/languages/kotlin'
import swift from 'highlight.js/lib/languages/swift'

for (const [name, lang] of [
  ['javascript', javascript], ['typescript', typescript], ['json', json],
  ['python', python], ['go', go], ['rust', rust], ['java', java], ['c', c],
  ['cpp', cpp], ['csharp', csharp], ['bash', bash], ['yaml', yaml], ['ini', ini],
  ['xml', xml], ['css', css], ['scss', scss], ['sql', sql], ['ruby', ruby],
  ['php', php], ['markdown', markdownLang], ['dockerfile', dockerfile],
  ['kotlin', kotlin], ['swift', swift],
] as const) {
  hljs.registerLanguage(name, lang)
}

// File extension → highlight.js language id.
const EXT_LANG: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', json: 'json', jsonc: 'json',
  py: 'python', go: 'go', rs: 'rust', java: 'java', c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', cs: 'csharp',
  sh: 'bash', bash: 'bash', zsh: 'bash', yml: 'yaml', yaml: 'yaml',
  toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', vue: 'xml',
  css: 'css', scss: 'scss', sass: 'scss', sql: 'sql', rb: 'ruby',
  php: 'php', md: 'markdown', markdown: 'markdown', dockerfile: 'dockerfile',
  kt: 'kotlin', kts: 'kotlin', swift: 'swift',
}

// Bundled worker (no network — the strict CSP forbids external fetches).
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

/** The viewer's per-file state, produced by Workspace.openFile. */
export type Preview =
  | { kind: 'text' | 'markdown'; path: string; content: string; note: string | null }
  | { kind: 'image'; path: string; mime: string; dataB64: string }
  | { kind: 'pdf' | 'docx'; path: string; dataB64: string }
  | { kind: 'unsupported'; path: string; note: string }

const PDF_PAGE_CAP = 50

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function FilePreview({
  preview,
  onClose,
}: {
  preview: Preview
  onClose: () => void
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-1 flex-col border-l border-zinc-800">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1.5">
        <span className="truncate font-mono text-xs text-zinc-300" title={preview.path}>
          {preview.path}
        </span>
        {'note' in preview && preview.note && (
          <span className="shrink-0 text-[10px] text-amber-400">{preview.note}</span>
        )}
        <button
          onClick={onClose}
          className="ml-auto shrink-0 rounded px-1.5 text-zinc-400 hover:bg-zinc-800"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <Body preview={preview} />
      </div>
    </div>
  )
}

function Body({ preview }: { preview: Preview }): React.JSX.Element {
  switch (preview.kind) {
    case 'text':
      return <CodeView content={preview.content} path={preview.path} />
    case 'markdown':
      return (
        <div className="markdown px-4 py-3 text-sm text-zinc-200">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview.content}</ReactMarkdown>
        </div>
      )
    case 'image':
      return (
        <div className="flex items-center justify-center p-4">
          <img
            src={`data:${preview.mime};base64,${preview.dataB64}`}
            className="max-h-full max-w-full"
            style={{ imageRendering: 'auto' }}
          />
        </div>
      )
    case 'pdf':
      return <PdfView dataB64={preview.dataB64} />
    case 'docx':
      return <DocxView dataB64={preview.dataB64} />
    case 'unsupported':
      return <p className="p-6 text-center text-sm text-zinc-500">{preview.note}</p>
  }
}

/** Syntax-highlighted code, falling back to plain text for unknown types. */
function CodeView({ content, path }: { content: string; path: string }): React.JSX.Element {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  const lang = EXT_LANG[ext]
  const html = useMemo(() => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(content, { language: lang }).value
      } catch {
        /* fall through to plain */
      }
    }
    return null
  }, [content, lang])

  return (
    <pre className="overflow-auto px-3 py-2 font-mono text-xs leading-5">
      {html ? (
        <code className="hljs !bg-transparent" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <code className="whitespace-pre text-zinc-300">{content}</code>
      )}
    </pre>
  )
}

/** Renders each PDF page to a canvas via the bundled pdf.js. */
function PdfView({ dataB64 }: { dataB64: string }): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'done' | string>('loading')
  const [truncated, setTruncated] = useState(0)

  useEffect(() => {
    let cancelled = false
    const container = ref.current
    if (container) container.innerHTML = ''
    let task: ReturnType<typeof pdfjsLib.getDocument> | undefined
    void (async () => {
      try {
        task = pdfjsLib.getDocument({ data: b64ToBytes(dataB64) })
        const doc = await task.promise
        if (cancelled) return
        const n = Math.min(doc.numPages, PDF_PAGE_CAP)
        if (doc.numPages > PDF_PAGE_CAP) setTruncated(doc.numPages)
        for (let i = 1; i <= n; i++) {
          const page = await doc.getPage(i)
          if (cancelled) return
          const viewport = page.getViewport({ scale: 1.4 })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.className = 'mx-auto mb-3 block max-w-full shadow-lg'
          container?.appendChild(canvas)
          const ctx = canvas.getContext('2d')
          if (ctx) await page.render({ canvasContext: ctx, viewport }).promise
        }
        if (!cancelled) setStatus('done')
      } catch (e) {
        if (!cancelled) setStatus((e as Error).message || 'could not render PDF')
      }
    })()
    return () => {
      cancelled = true
      void task?.destroy()
    }
  }, [dataB64])

  return (
    <div className="bg-zinc-950/40 p-4">
      {status === 'loading' && <p className="text-center text-sm text-zinc-500">rendering PDF…</p>}
      {status !== 'loading' && status !== 'done' && (
        <p className="text-center text-sm text-red-400">{status}</p>
      )}
      {truncated > 0 && (
        <p className="mb-2 text-center text-xs text-amber-400">
          showing first {PDF_PAGE_CAP} of {truncated} pages
        </p>
      )}
      <div ref={ref} />
    </div>
  )
}

/** Converts a .docx to HTML with mammoth and renders it. */
function DocxView({ dataB64 }: { dataB64: string }): React.JSX.Element {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const bytes = b64ToBytes(dataB64)
        const { value } = await mammoth.convertToHtml({
          arrayBuffer: bytes.buffer as ArrayBuffer,
        })
        if (!cancelled) setHtml(value)
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'could not read document')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [dataB64])

  if (error) return <p className="p-6 text-center text-sm text-red-400">{error}</p>
  if (html === null) return <p className="p-6 text-center text-sm text-zinc-500">reading document…</p>
  // mammoth emits a bounded element set and no scripts; innerHTML never runs
  // scripts, and the CSP blocks external loads. Embedded images arrive as
  // data: URLs (img-src data: is allowed).
  return (
    <div
      className="markdown mx-auto max-w-3xl px-6 py-5 text-sm text-zinc-200"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
