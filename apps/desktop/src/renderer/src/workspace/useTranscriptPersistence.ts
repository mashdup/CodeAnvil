import { useEffect, useRef } from 'react'
import type { InferenceStats, Item } from './types'

interface UseTranscriptPersistenceParams {
  cwd: string
  items: Item[]
  setItems: React.Dispatch<React.SetStateAction<Item[]>>
  setMode: (mode: any) => void
  modeRef: React.MutableRefObject<any>
  reseatIds: (items: Item[]) => void
  push: (item: Item) => void
  uid: () => string
  /** Last-turn token/context stat, persisted so the ContextMeter can describe
   *  a restored chat's context usage on reload. */
  lastInference: InferenceStats | null
  setLastInference: (v: InferenceStats | null) => void
}

export function useTranscriptPersistence({
  cwd,
  items,
  setItems,
  setMode,
  modeRef,
  reseatIds,
  push,
  uid,
  lastInference,
  setLastInference,
}: UseTranscriptPersistenceParams): React.MutableRefObject<boolean> {
  const loadedRef = useRef(false)
  const bootedRef = useRef(false)

  // Boot: restore the saved transcript, then start (or adopt) the agent.
  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    void (async () => {
      // Before the agent starts, so 'ready' can re-apply it.
      const stored = await window.codehamr.getMode(cwd)
      setMode(stored)
      modeRef.current = stored
      const saved = (await window.codehamr.readTranscript(cwd)) as Item[] | null
      if (Array.isArray(saved)) {
        // Reseat the id counter past restored ids so new items can't collide.
        reseatIds(saved)
        setItems(saved.map((it) => ('streaming' in it ? { ...it, streaming: false } : it)))
      }
      // Restore the context stat so the meter isn't blank until the next turn.
      // Only promptTokens + contextWindow are persisted (completionTokens/
      // durationMs are per-turn and would mislabel a restored value), so the
      // "last message" and tok/s readouts stay hidden until a real turn runs.
      // Wrapped so a failed/absent IPC handler can never block agent startup —
      // this is a nice-to-have readout, not a boot dependency.
      try {
        const stat = await window.codehamr.readContextStat(cwd)
        if (stat && stat.promptTokens > 0) {
          setLastInference({
            promptTokens: stat.promptTokens,
            completionTokens: 0,
            contextWindow: stat.contextWindow,
          })
        }
      } catch {
        // older main process without the handler, or read error — ignore
      }
      loadedRef.current = true
      const { seededFrom } = await window.codehamr.startAgent(cwd)
      if (seededFrom) {
        push({
          kind: 'notice',
          id: uid(),
          text: `new project — endpoints configured from your "${seededFrom}" preset`,
          tone: 'info',
        })
      }
    })()
  }, [cwd, push])

  // Debounced transcript autosave; gated on loadedRef so the initial empty
  // state can never clobber a saved transcript before the restore completes.
  useEffect(() => {
    if (!loadedRef.current) return
    const t = setTimeout(() => void window.codehamr.writeTranscript(cwd, items), 500)
    return () => clearTimeout(t)
  }, [items, cwd])

  // Persist the context stat alongside the transcript. Writing null (on clear/
  // switch) wipes it so a fresh session's meter doesn't inherit a stale count.
  useEffect(() => {
    if (!loadedRef.current) return
    void window.codehamr.writeContextStat(
      cwd,
      lastInference
        ? { promptTokens: lastInference.promptTokens, contextWindow: lastInference.contextWindow }
        : { promptTokens: 0 },
    )
  }, [lastInference, cwd])

  return loadedRef
}
