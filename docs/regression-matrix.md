# HTML Slide Studio regression foundation

## Running locally

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npx.cmd playwright test
npx.cmd playwright show-report
```

Use `.cmd` on this machine: PowerShell execution policy blocks the `npx.ps1` shim. No execution-policy change is required.

`playwright.config.mjs` starts `tests/browser/server.mjs` on **127.0.0.1:4417**. It refuses to reuse an existing listener. It does not use the deployed application on port 4317, a user's browser profile, or a user's files. Each test receives a fresh nonpersistent Chromium context. The test server imports the server factory without reading `.env`; its fake API key is not a credential and its provider client always throws. Browser routing blocks requests outside the isolated server. The AI response is intercepted in the test, so these tests incur no API charges.

Fixture: `tests/fixtures/two-slides.html`, two slides with inline CSS and no external assets. Downloads are read from Playwright's temporary directory and reimported as in-memory file uploads. Reports, traces, and screenshots go to ignored `playwright-report/` and `test-results/` directories.

## Verified baseline — 2026-11-19

Actual execution on Windows 10 Home 10.0.19045, Node 26.13.0, Playwright 1.65.1 and its Chromium: **6 passing tests + 2 reproduced expected failures**, exit code 0, approximately 22 seconds. Playwright's summary prints `8 passed` because expected failures satisfy the test contract; this does **not** mean the two editor bugs are fixed. A future unexpected pass will fail the suite until its `test.fail` annotation is removed.

The installed browser actually launches on this machine. This is local evidence, not a claim of official Windows 10 support or of compatibility with the future Tauri/WebView2 application. Desktop shell and installer tests remain separate work.

| Scenario | Coverage | Baseline result |
| --- | --- | --- |
| Import HTML; two rail cards; navigate slides | Visible objects and hidden previous slide | Pass |
| Delete with canvas iframe focused | Only selected object hidden | Pass |
| Shift multi-select; Delete; Undo; Redo | Both selected objects deleted/restored as one operation | Pass |
| Save project JSON, reset, reimport | Download and full editor state match | Pass |
| Export HTML, reset, reimport | Download manifest and full editor state match | Pass |
| AI action workflow | Mock proposal, no change before Apply, 2,000 ms action applied, Undo | Pass; not live model quality |
| Delete after toolbar takes focus | Expected hidden selected object | Known failure: parent document lacks Delete handler |
| Drag selection rectangle on slide background | Expected two enclosed objects selected | Known failure: no marquee implementation |

The iframe Delete test explicitly focuses its body after pointer selection, because selection prevents the default pointer focus behavior. It verifies the iframe's existing keyboard handler, not seamless focus transfer across the application. The toolbar test checks actual focused-button keyboard behavior without calling the app command directly.

## Required coverage in implementation stages

| Requested capability | Acceptance check to add when implemented |
| --- | --- |
| Thumbnail fidelity | Compare imported-slide layout against rail rendering, including inherited CSS, linked assets, SVG, canvas, fonts, and animation state; currently navigation only is tested |
| Resizable rail/panels | Pointer resize, minimum/maximum widths, editor fit, persistence and keyboard accessibility |
| PowerPoint-like scoped UI | File menu and ribbon discoverability, focus order, undo states and accessible names |
| Keyboard editing | Parent/iframe/text-input focus matrix; Delete, Backspace, arrows, Shift arrows, copy/cut/paste, Undo/Redo/Save; preserve text editing and IME |
| Marquee / multi-selection | Enclosed/intersecting objects, additive selection, zoom, drag and delete/undo; turn known failure into passing regression |
| All-object outlines | Toggle persists through selection; distinct selected/unselected border styling; disable removes only all-object outlines |
| Native open/save/Save As/PDF | Dialog cancel/error/success, Unicode paths, overwrite behavior, document fidelity and PDF rendering |
| AI edit existing actions | Request includes current action context; targeted update of 200 ms to 2,000 ms without duplicating action; undo and reject stale response |
| AI sequential animation | Black-to-light entrance followed by graph growth; dependency timing, playback, replay, save and reopen |
| Effects gallery | Preview and apply common effects; respect reduced motion; selected-target validation; save/reopen |
| Remove voice input | No microphone UI or speech-recognition invocation |
| Rust/Tauri desktop | Native build/launch/WebView2, commands and filesystem boundaries, keyboard/menu integration, packaging |

These rows are pending acceptance work, not skipped tests claimed as passing. The current foundation deliberately leaves editor behavior unchanged. The mocked AI test verifies UI integration and persisted action semantics only; it does not prove natural-language understanding, timing playback, action updates, or real provider connectivity.
