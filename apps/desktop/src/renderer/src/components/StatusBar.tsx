import { useEffect, useRef, useState } from 'react'
import type { ModelProfile } from '@codehamr-ui/protocol'
import type { Phase } from '../workspace/types'

/**
 * VisionHint sits beside queued attachments and names the model they'll be
 * sent to. Capability can't be detected reliably across arbitrary endpoints,
 * so this is a soft heuristic: warn-toned when the model name doesn't look
 * multimodal (some servers silently IGNORE image parts on text-only models —
 * no error ever arrives, so this hint is the only clue the user gets).
 */
export function VisionHint({
  models,
  activeModel,
}: {
  models: ModelProfile[]
  activeModel: string
}): React.JSX.Element | null {
  const llm = models.find((m) => m.name === activeModel)?.llm ?? ''
  if (!llm) return null
  const looksVision = /vl|vision|llava|gemma3|4o|pixtral|multimodal/i.test(llm)
  return (
    <span className={`pb-0.5 text-[11px] ${looksVision ? 'text-zinc-500' : 'text-amber-400'}`}>
      {looksVision
        ? `image will be sent to ${llm}`
        : `heads-up: "${llm}" doesn't look like a vision model — it may ignore or reject the image`}
    </span>
  )
}

/**
 * ContextMeter shows how full the active model’s context window is, using the
 * prompt-token count of the last turn (what the agent actually packed and
 * sent) against the effective window. The denominator is the agent-reported
 * contextWindow when available (covers server-managed profiles whose config
 * omits context_size), else the profile’s configured contextSize. A tight
 * vertical bar that fills bottom-to-top; it warns-tones as the window fills.
 * Tap the bar for a popup (anchored to the bar) with the exact percentage and
 * token count, so a compact/clear is an obvious next move before the agent
 * starts trimming history.
 */
export function ContextMeter({
  models,
  activeModel,
  promptTokens,
  contextWindow,
  lastCompletionTokens,
}: {
  models: ModelProfile[]
  activeModel: string
  promptTokens: number
  contextWindow: number
  /** Tokens the model generated on the last turn (the completion only). */
  lastCompletionTokens?: number
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Dismiss the popup on any outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const denom = contextWindow || (models.find((m) => m.name === activeModel)?.contextSize ?? 0)
  if (!denom) return null
  const ratio = Math.min(Math.max(promptTokens, 0) / denom, 1)
  const pct = Math.round(ratio * 100)
  const tone =
    ratio >= 0.9 ? 'text-red-400' : ratio >= 0.75 ? 'text-amber-400' : 'text-zinc-500'
  const barColor =
    ratio >= 0.9 ? 'bg-red-500' : ratio >= 0.75 ? 'bg-amber-500' : 'bg-zinc-500'
  return (
    <div ref={rootRef} className="relative flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`context window ${pct}% used`}
        aria-expanded={open}
        title="context window — tap for details"
        className="flex h-5 w-1.5 items-end overflow-hidden rounded-full bg-zinc-800 outline-none ring-offset-1 ring-offset-zinc-900 focus-visible:ring-1 focus-visible:ring-zinc-500"
      >
        <div
          className={`w-full rounded-full ${barColor} transition-[height]`}
          style={{ height: `${Math.max(ratio * 100, 4)}%` }}
        />
      </button>
      {open && (
        <div
          className={`absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-[10px] shadow-lg ${tone}`}
        >
          <div className="font-semibold">{pct}% of context</div>
          <div className="text-zinc-400">
            {promptTokens.toLocaleString()} / {denom.toLocaleString()} tokens
          </div>
          {lastCompletionTokens != null && lastCompletionTokens > 0 && (
            <div className="mt-0.5 text-zinc-500">
              {lastCompletionTokens.toLocaleString()} tokens generated last turn
            </div>
          )}
          <div className="absolute left-1/2 top-full -mt-px h-1.5 w-1.5 -translate-x-1/2 rotate-45 border-b border-r border-zinc-700 bg-zinc-900" />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status bar: continuous proof of life during silent phases.
// ---------------------------------------------------------------------------

const phaseText: Record<Phase | 'approval', string> = {
  idle: '',
  waiting: 'waiting for the model — local models can be silent for a while during prefill',
  thinking: 'model is thinking',
  streaming: 'responding',
  tool: 'running tool',
  approval: 'waiting for your approval on the tool call above',
}

export function StatusBar({
  phase,
  tool,
  elapsed,
  step,
  streamMeter,
  prefillMs,
  onCancel,
}: {
  phase: Phase | 'approval'
  tool: string
  elapsed: number
  step: number
  streamMeter: { tokens: number; tokPerSec: number } | null
  prefillMs: number | null
  onCancel: () => void
}): React.JSX.Element {
  const clock = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`
  const num = (n: number): string => n.toLocaleString()

  let label: string
  if (phase === 'tool') {
    // Contextual tool line, e.g. "reading api.ts" / "running: npm test".
    label = tool || 'running tool'
  } else if (phase === 'streaming') {
    // Prefill/gen split + live generation meter.
    const parts: string[] = []
    if (prefillMs != null) parts.push(`prefill ${(prefillMs / 1000).toFixed(1)}s ·`)
    parts.push('generating')
    if (streamMeter && streamMeter.tokens > 0) {
      parts.push(`· ~${num(streamMeter.tokens)} tok`)
      if (streamMeter.tokPerSec > 0) parts.push(`· ~${num(streamMeter.tokPerSec)} tok/s`)
    }
    label = parts.join(' ')
  } else if (phase === 'waiting') {
    label = elapsed >= 20 ? 'still working' : 'waiting for the model'
  } else {
    label = phaseText[phase]
  }

  // Step badge for multi-round agentic turns (hidden for a simple single reply).
  const showStep = step >= 1 && (phase === 'tool' || step >= 2)

  return (
    <div className="flex items-center gap-2 border-t border-zinc-800 bg-zinc-900/70 px-4 py-1.5 text-xs text-zinc-400">
      <span
        className={`h-2 w-2 shrink-0 animate-pulse rounded-full ${
          phase === 'approval' ? 'bg-amber-400' : 'bg-emerald-500'
        }`}
      />
      {showStep && (
        <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] tabular-nums text-zinc-300">
          step {step}
        </span>
      )}
      <span className="truncate">{label}</span>
      <span className="ml-auto shrink-0 tabular-nums">{clock}</span>
      <button
        onClick={onCancel}
        className="shrink-0 rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 hover:bg-zinc-700"
      >
        Cancel
      </button>
    </div>
  )
}
