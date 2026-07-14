import { useCallback, useEffect, useRef, useState } from 'react'

/** Per-file working-tree git status, keyed by normalized absolute path. */
export type GitChangeKind = 'modified' | 'added' | 'untracked'
export type ChangedPaths = Map<string, GitChangeKind>

export type GitStatus = {
  currentBranch: string | null
  diffStats: { added: number; removed: number } | null
  /** Normalized (lowercased, forward-slashed) abs path → change kind. */
  changedPaths: ChangedPaths
  refreshGitStat: () => void
}

const norm = (p: string): string => p.replace(/\\/g, '/').toLowerCase()

/**
 * Git branch, working-tree diff stat, and per-file working-tree change status
 * for the workspace, fetched from the main process (real `git` calls). All are
 * refreshed together (a checkout or edit changes them at once) and debounced so
 * a burst of filesystem changes coalesces into one query. The diff stat feeds
 * the bar badge; changedPaths feeds the file tree's change indicators. null /
 * empty values mean unknown, unchanged, or not a git repo.
 */
export function useGitStatus(cwd: string): GitStatus {
  const [currentBranch, setCurrentBranch] = useState<string | null>(null)
  const [diffStats, setDiffStats] = useState<{ added: number; removed: number } | null>(null)
  const [changedPaths, setChangedPaths] = useState<ChangedPaths>(new Map())
  const gitTimer = useRef<number | undefined>(undefined)
  const refreshGitStat = useCallback(() => {
    window.clearTimeout(gitTimer.current)
    gitTimer.current = window.setTimeout(() => {
      void window.codehamr.gitDiffStat(cwd).then(setDiffStats)
      void window.codehamr.gitBranch(cwd).then(setCurrentBranch)
      void window.codehamr.gitStatus(cwd).then((s) => {
        const map: ChangedPaths = new Map()
        if (s) {
          for (const p of s.modified) map.set(norm(p), 'modified')
          for (const p of s.added) map.set(norm(p), 'added')
          for (const p of s.untracked) map.set(norm(p), 'untracked')
        }
        setChangedPaths(map)
      })
    }, 250)
  }, [cwd])
  // .git metadata churn (commit, checkout, external `git add`/`git commit`)
  // doesn't necessarily touch any tracked file's own mtime, so the tree's
  // fs-change watcher (which ignores .git/) never catches it on its own —
  // without this, the file tree and preview's change indicators go stale
  // right after a commit until something else happens to trigger a refresh.
  useEffect(() => {
    return window.codehamr.onGitChanged(({ cwd: changedCwd }) => {
      if (changedCwd === cwd) refreshGitStat()
    })
  }, [cwd, refreshGitStat])
  return { currentBranch, diffStats, changedPaths, refreshGitStat }
}
