# CodeHamr UI

A desktop coding harness for [codehamr](https://codehamr.com) — chat with the
agent visually: streaming markdown replies, live "thinking" display, gated
tool approvals, inline diffs for every file edit, image drop, a graphical
config editor, and sessions that survive restarts.

Unofficial. Runs a [lightly patched fork](https://github.com/mashdup/codehamr)
of the agent (git submodule) that adds a headless `--json` NDJSON mode; the
TUI and agent core are upstream's, unchanged.

## Architecture

```
Electron renderer (React)  ── typed IPC ──  Electron main
                                                │  child-process stdio (NDJSON)
                                        codehamr --json  (Go)
```

No localhost servers anywhere: renderer↔main is Electron IPC, main↔agent is
stdin/stdout. The wire contract lives in `packages/protocol` (zod schemas),
mirrored by the fork's `internal/protocol` Go structs.

## Development

Prereqs: Node 22+, Go 1.26+, Git for Windows (the agent's bash tool needs a
POSIX shell on Windows).

```sh
git clone --recurse-submodules git@github.com:mashdup/CodeHamrUI.git
cd CodeHamrUI
npm install
npm run agent:build   # builds the fork (GOEXPERIMENT=nogreenteagc — see PLAN.md §8)
npm run dev           # launches the app with HMR
```

Open a project folder in the app; the agent bootstraps `.codehamr/config.yaml`
there (edit it via the ⚙ panel). Point a profile at local Ollama, any
OpenAI-compatible endpoint, or HamrPass. Image drop needs a vision model
behind the endpoint; on a text-only model the app degrades gracefully.

## Packaging & releases

```sh
npm run dist:win   # NSIS installer in apps/desktop/release/ (agent bundled)
npm run dist:mac   # run on a Mac; dmg config is ready
```

Tagging `v*` (matching `apps/desktop/package.json`'s version) makes CI build
the Windows installer and macOS dmg and attach both to a draft GitHub
Release. Published releases feed the in-app auto-updater: the app downloads
updates in the background and shows an "Update — restart" button (it never
restarts on its own; running agent sessions are stopped only when you click).

**Windows** ships unsigned for now (SmartScreen will warn on first run).

**macOS signing + notarization** activates automatically when these repo
secrets exist (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `MAC_CERT_P12` | base64 of a *Developer ID Application* certificate exported as .p12 (`base64 -i cert.p12`) |
| `MAC_CERT_PASSWORD` | the .p12 export password |
| `APPLE_ID` | your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | generate at appleid.apple.com → App-Specific Passwords |
| `APPLE_TEAM_ID` | 10-char team id (developer.apple.com → Membership) |

Create the certificate at developer.apple.com → Certificates → *Developer ID
Application* (needs a CSR — Keychain Access on a Mac, or openssl anywhere).
Without the secrets, mac builds stay unsigned; macOS auto-update requires the
signed build.

See [PLAN.md](PLAN.md) for the full architecture, protocol spec, and
milestone log.
