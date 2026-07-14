import { execFileSync } from 'node:child_process'

/**
 * macOS/Linux apps launched from Finder/Dock/Spotlight are children of
 * launchd, not of a login shell, so they inherit launchd's bare-bones PATH
 * (typically just /usr/bin:/bin:/usr/sbin:/sbin) — none of the entries a
 * user's .zprofile/.zshrc add (Homebrew, nvm, cargo, ...). AgentSession
 * spreads process.env verbatim into the spawned codehamr binary, which in
 * turn passes its inherited env straight through to every bash-tool
 * `/bin/sh -c`, so a bad PATH here means `npm`/`brew`/etc. "don't exist" for
 * every tool call — even though they work fine in the user's terminal, where
 * Terminal.app starts a real login shell that sources those files.
 *
 * Fix: spawn the user's own shell once as a login+interactive shell (so it
 * sources both .zprofile and .zshrc, matching what Terminal.app does) and
 * adopt its PATH. Delimiter-wrapped so shell startup noise (motd, nvm/asdf
 * banners) can't corrupt the value. Best-effort: PATH is left untouched on
 * any failure, so a broken user shell config never blocks app startup.
 */
export function fixShellPath(): void {
  if (process.platform === 'win32') return
  const shell = process.env.SHELL || '/bin/bash'
  const marker = '___codehamr_path___'
  try {
    const out = execFileSync(shell, ['-ilc', `echo "${marker}\${PATH}${marker}"`], {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const match = out.match(new RegExp(`${marker}(.*)${marker}`, 's'))
    const shellPath = match?.[1]?.trim()
    if (shellPath) process.env.PATH = shellPath
  } catch {
    // Best-effort: keep launchd's PATH rather than block startup on a shell
    // that errors out of -ilc (bad rc file, missing $SHELL binary, etc.).
  }
}
