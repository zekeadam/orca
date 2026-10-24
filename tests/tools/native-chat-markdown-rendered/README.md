# Native chat Markdown rendered evidence

Run from the worktree root with Node and installed repository dependencies:

```powershell
$env:ORCA_BACKGROUND_LAUNCH = '1'
$env:ORCA_CHAT_SCRATCH_DIR = '<absolute writable scratch directory>'
node tests/tools/native-chat-markdown-rendered/run.mjs before <baseline-git-ref>
node tests/tools/native-chat-markdown-rendered/run.mjs after
```

The Vite fixture imports the actual `NativeChatPromptEditor`, its draft store and pill components, and canonical `main.css` / native chat appearance CSS. Its explicit Tailwind source path includes the real native chat components. Before overrides only the editor module from the supplied Git ref (defaults to `origin/dev`); after reads the working file. Use a ref from before this feature, such as `52ee172ac2e`, even after committing. Each report records the baseline ref and source hash and saves the exact source snapshot.

Electron uses `show:false`, `focusable:false`, offscreen painting, and a fresh profile within scratch per launch. The runner sets `ORCA_BACKGROUND_LAUNCH=1`, connects Playwright through CDP, uses DOM focus emulation without activating an OS window, and rejects native show/focus events. Windows may require an unsandboxed tool launch to read the pnpm Electron installation; the script does not change installation ACLs or the installed Orca app.

Evidence is written under `<scratch>/native-chat-markdown/{before,after}`: light/dark inline and block screenshots, a pill screenshot, computed styles, check results, source snapshot, and Electron logs. Screenshots come directly from `Page.captureScreenshot`; they do not use OS capture. The final test report is `report.json`.

Checks cover literal source visibility, per-kind computed Markdown styles, caret deletion/replacement, multiline editing, Enter and Shift+Enter, plain text versus HTML DOM paste, Chromium composition with Japanese Unicode input, style refresh after composition, skill/file atom preservation through draft remount and nearby edits, typed delimiters, and undo/redo source changes.

Scope limits: this is the editor component, not the complete send/autocomplete/attachment picker flow, SSH transport, OS clipboard or native IME. Draft remount exercises the renderer cache, not application quit/reload persistence. Native focus and visible-window checks remain excluded. Before/after share current non-editor dependencies and canonical CSS.
