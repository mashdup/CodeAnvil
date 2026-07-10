import { useCallback, useEffect, useState } from 'react'

/**
 * FileTree: lazy directory tree for the open workspace. Directories load on
 * first expand (never a full recursive walk — node_modules stays cheap).
 * `touched` paths (files the agent wrote/edited this session) get an emerald
 * dot; `refreshKey` bumps re-fetch every already-loaded directory so agent
 * edits appear without losing expansion state.
 */

interface Entry {
  name: string
  path: string
  isDir: boolean
}

export function FileTree({
  root,
  touched,
  refreshKey,
  onOpen,
}: {
  root: string
  touched: Set<string>
  refreshKey: number
  onOpen: (path: string) => void
}): React.JSX.Element {
  const [children, setChildren] = useState<Record<string, Entry[]>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const load = useCallback(
    async (dir: string): Promise<void> => {
      try {
        const entries = await window.codehamr.listDir(root, dir)
        setChildren((prev) => ({ ...prev, [dir]: entries }))
      } catch {
        setChildren((prev) => ({ ...prev, [dir]: [] }))
      }
    },
    [root],
  )

  // Root loads immediately; on refresh, re-fetch everything already loaded.
  useEffect(() => {
    void load(root)
    setChildren((prev) => {
      for (const dir of Object.keys(prev)) {
        if (dir !== root) void load(dir)
      }
      return prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, refreshKey, load])

  const toggle = (dir: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(dir)) {
        next.delete(dir)
      } else {
        next.add(dir)
        if (!children[dir]) void load(dir)
      }
      return next
    })
  }

  const renderDir = (dir: string, depth: number): React.JSX.Element[] => {
    const entries = children[dir] ?? []
    return entries.flatMap((e) => {
      const pad = { paddingLeft: `${depth * 14 + 6}px` }
      if (e.isDir) {
        const open = expanded.has(e.path)
        return [
          <button
            key={e.path}
            onClick={() => toggle(e.path)}
            style={pad}
            className="flex w-full items-center gap-1 truncate py-0.5 text-left text-zinc-400 hover:bg-zinc-800/60"
          >
            <span className="w-3 shrink-0 text-[10px]">{open ? '▾' : '▸'}</span>
            <span className="truncate">{e.name}</span>
          </button>,
          ...(open ? renderDir(e.path, depth + 1) : []),
        ]
      }
      const isTouched = touched.has(e.path.toLowerCase())
      return [
        <button
          key={e.path}
          onClick={() => onOpen(e.path)}
          style={pad}
          className="flex w-full items-center gap-1 truncate py-0.5 text-left text-zinc-300 hover:bg-zinc-800/60"
          title={e.path}
        >
          <span className="w-3 shrink-0" />
          <span className="truncate">{e.name}</span>
          {isTouched && (
            <span className="ml-auto mr-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" title="edited by the agent this session" />
          )}
        </button>,
      ]
    })
  }

  return <div className="py-1 font-mono text-xs">{renderDir(root, 0)}</div>
}
