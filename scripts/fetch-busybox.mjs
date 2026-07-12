// Fetches busybox-w32 — a single ~700 KB exe that provides a POSIX `sh` plus
// coreutils (ls, grep, cat, sed, find, …) — and installs it as
// apps/desktop/build/shell/sh.exe. electron-builder bundles that into the
// packaged Windows app (resources/shell/sh.exe), and the agent uses it for the
// bash tool via CODEHAMR_SHELL, so the app needs no Git for Windows. Invoked as
// sh.exe, busybox runs its shell applet; its standalone shell resolves the
// coreutils applets, while real toolchain (git/npm/node) still comes from PATH.
//
// Source: Ron Yorston's busybox-w32 (https://frippery.org/busybox/). Pin
// EXPECTED_SHA256 to the build you vet for reproducible, verified packaging.
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const URL = 'https://frippery.org/files/busybox/busybox64.exe' // 64-bit build
// Pinned to the vetted build. `busybox64.exe` tracks upstream's latest, so if
// Ron Yorston publishes a new one this mismatches and the build fails closed —
// re-vet, then re-pin (the script prints the new hash when this is blanked).
const EXPECTED_SHA256 = '07bb1e5b095b00d68a695481f9240879f33c5724b40aa2308f999d54ed78f075'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'apps', 'desktop', 'build', 'shell', 'sh.exe')

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

async function main() {
  if (existsSync(dest) && statSync(dest).size > 0) {
    console.log('busybox shell already present:', dest)
    return
  }
  console.log('downloading busybox-w32 from', URL)
  const res = await fetch(URL)
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const got = sha256(buf)

  if (EXPECTED_SHA256) {
    if (got !== EXPECTED_SHA256) {
      throw new Error(`SHA-256 mismatch — refusing to bundle.\n  expected ${EXPECTED_SHA256}\n  got      ${got}`)
    }
  } else {
    console.warn('⚠ EXPECTED_SHA256 is not pinned. sha256 of this download:')
    console.warn('   ', got)
    console.warn('  Pin it in scripts/fetch-busybox.mjs for verified, reproducible builds.')
  }

  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, buf)
  console.log(`wrote ${dest} (${(buf.length / 1024).toFixed(0)} KB)`)
}

main().catch((e) => {
  console.error('fetch-busybox failed:', e.message)
  process.exit(1)
})
