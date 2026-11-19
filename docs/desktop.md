# Windows desktop build

The desktop application uses Rust/Tauri for the native window, document dialogs, atomic file saves and print-preview window. HTML/CSS/JavaScript remain the renderer. The existing Node API service is packaged as a child process rather than rewritten during this migration.

```powershell
npm.cmd run desktop:build
node scripts/desktop-smoke.mjs
```

Output: `artifacts/HTML-Slide-Studio-Windows-x64/HTML Slide Studio.exe`. Keep its `resources` folder alongside it. WebView2 Runtime must be installed. The Node runtime and its license are included, so Node does not need to be installed on the destination machine.

Build preparation allow-lists application sources and never copies `.env` files, user drafts, tests, logs, or dependency caches. Rust caches are stored under `%LOCALAPPDATA%/SlideStudioDev/cargo-target`. A different trusted Node executable/license can be supplied through `STUDIO_NODE_PATH` and `STUDIO_NODE_LICENSE` when preparing the distribution.

## Native bridge contract

`public/desktop.js` must load before `app.js`. It installs `window.studioDesktop` only in the bundled top-level editor. In a browser it does nothing.

- `open()` opens a native file picker and returns `{name,text,path}` or null. It does not yet change the active save destination.
- `acceptDocument(path)` accepts the last picker-selected path only after the frontend successfully parses/imports the document. It clears destinations belonging to a previous document.
- `resetDocument()` clears saved destinations on New and browser/file-drop imports.
- `save({name,text,type,saveAs})` uses a native Save dialog as needed, then atomically replaces the selected document. HTML and project JSON have separate destinations within the current document. Cancel returns false.
- `print({html})` opens an isolated preview and the Windows print dialog after fonts/images load. Select Microsoft Print to PDF for PDF output. The editor prepares slide-only paginated HTML.

The frontend must call `acceptDocument` only on successful native import and must await `resetDocument` when changing documents by other means.

## Boundaries and validation

The app loads its editor from Tauri bundled assets. Main-window navigation is limited to the packaged editor URL. Tauri command permissions apply only to the local main window; imported `sandbox="allow-scripts"` slide frames and the print window have no native command permissions. Native API requests are limited to the session/action/design routes, use the random-port loopback service, and carry its session token. No generic shell, filesystem, or URL proxy command is exposed.

The backend exits when the desktop process closes its stdin pipe, and Rust explicitly kills/waits for it on application exit. The smoke test launches its own app with a temporary WebView2 debugging port, checks rendering, local API session response, rejected arbitrary save path and imported-frame IPC denial, captures a screenshot, and closes that test process. It does not call a model.

Native open currently expects UTF-8 HTML/project JSON; referenced relative CSS/images must be included in the document for portable fidelity. Native file-dialog interactions and the user's PDF printer settings are distinct from the automated browser regression suite.

Tauri security references: [capabilities](https://v2.tauri.app/security/capabilities/), [window builder](https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindowBuilder.html).
