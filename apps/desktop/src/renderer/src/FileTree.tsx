import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * FileTree: a drill-in file browser for the open workspace. Instead of an
 * ever-expanding tree, clicking a folder navigates INTO it (showing just that
 * folder's contents); a breadcrumb bar walks back up. The single-level list is
 * still virtualized so a folder with thousands of direct entries stays smooth.
 * `touched` files get an emerald dot; `reload` re-fetches the current folder
 * when it changes on disk.
 */

interface Entry {
  name: string
  path: string
  isDir: boolean
}

const ROW_H = 24
const OVERSCAN = 10

const basename = (p: string): string => p.split(/[\\/]/).filter(Boolean).pop() ?? p

export function FileTree({
  root,
  touched,
  reload,
  onOpen,
}: {
  root: string
  touched: Set<string>
  reload: { dirs: string[]; nonce: number } | null
  onOpen: (path: string) => void
}): React.JSX.Element {
  const [dir, setDir] = useState(root)
  const [entries, setEntries] = useState<Entry[]>([])

  // Guards against out-of-order navigation: a slow listing of a folder we've
  // already left must not overwrite the current one's contents.
  const reqRef = useRef(0)
  const load = useCallback(
    async (d: string): Promise<void> => {
      const token = ++reqRef.current
      let result: Entry[]
      try {
        result = await window.codehamr.listDir(root, d)
      } catch {
        result = []
      }
      if (token === reqRef.current) setEntries(result)
    },
    [root],
  )

  // Reset to the workspace root when the workspace changes.
  useEffect(() => {
    setDir(root)
  }, [root])

  // Load whenever the current directory changes.
  useEffect(() => {
    void load(dir)
  }, [dir, load])

  // Re-fetch the current folder if it (or a file in it) changed on disk.
  useEffect(() => {
    if (reload && reload.dirs.includes(dir)) void load(dir)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload?.nonce])

  // Breadcrumb: root + each ancestor segment down to the current directory.
  const sep = dir.includes('\\') ? '\\' : '/'
  const rel = dir === root ? '' : dir.slice(root.length).replace(/^[\\/]+/, '')
  const parts = rel ? rel.split(/[\\/]/) : []
  const crumbs = [{ name: basename(root) || root, path: root }]
  let acc = root
  for (const p of parts) {
    acc = `${acc}${sep}${p}`
    crumbs.push({ name: p, path: acc })
  }

  // Virtualized single-level list.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(600)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const measure = (): void => setViewportH(el.clientHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Reset scroll to the top on navigation.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setScrollTop(0)
  }, [dir])

  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN)
  const end = Math.min(entries.length, Math.ceil((scrollTop + viewportH) / ROW_H) + OVERSCAN)
  const visible = entries.slice(start, end)

  return (
    <div className="flex h-full flex-col font-mono text-xs">
      <div className="flex shrink-0 items-center overflow-x-auto border-b border-zinc-800 px-2 py-1 whitespace-nowrap text-zinc-400">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <span key={c.path} className="flex items-center">
              {i > 0 && <span className="mx-0.5 shrink-0 text-zinc-600">/</span>}
              <button
                onClick={() => setDir(c.path)}
                disabled={isLast}
                className={
                  isLast ? 'text-zinc-200' : 'shrink-0 hover:text-zinc-200 hover:underline'
                }
              >
                {c.name}
              </button>
            </span>
          )
        })}
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="flex-1 overflow-auto py-1"
      >
        {entries.length === 0 && <p className="px-3 py-2 text-zinc-600">empty folder</p>}
        {/* key by dir so rows fully remount on navigation — no stale reuse. */}
        <div key={dir}>
        <div style={{ height: start * ROW_H }} />
        {visible.map((entry) =>
          entry.isDir ? (
            <button
              key={entry.path}
              onClick={() => setDir(entry.path)}
              style={{ height: ROW_H }}
              className="flex w-full items-center gap-1.5 px-2 text-left text-zinc-300 hover:bg-zinc-800/60"
            >
              <span className="shrink-0 text-amber-500/80">▸</span>
              <span className="truncate">{entry.name}</span>
              <span className="ml-auto shrink-0 text-zinc-600">›</span>
            </button>
          ) : (
            <button
              key={entry.path}
              onClick={() => onOpen(entry.path)}
              style={{ height: ROW_H }}
              title={entry.path}
              className="flex w-full items-center gap-1.5 px-2 text-left text-zinc-300 hover:bg-zinc-800/60"
            >
              <span className="w-2 shrink-0" />
              <span className="truncate">{entry.name}</span>
              {touched.has(entry.path.toLowerCase()) && (
                <span
                  className="ml-auto mr-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400"
                  title="edited by the agent this session"
                />
              )}
            </button>
          ),
        )}
        <div style={{ height: (entries.length - end) * ROW_H }} />
        </div>
      </div>
    </div>
  )
}
