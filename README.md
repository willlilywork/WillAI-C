# WillAI-C

**WillAI-C (Connect)** is a desktop response-interaction workspace for the AI websites and web accounts a person already uses. It does not provide its own model and does not require provider API keys.

The desktop application is the primary product surface. A small Chromium extension acts only as a bridge to supported AI websites; it captures assistant responses and can insert user-approved shared context into the current composer. The AI website is not embedded inside WillAI-C and does not own the workspace.

## Current foundation

This first implementation establishes the central data distinction:

1. **Original Response** — the captured provider output, retained as a read-only source record.
2. **Working Nodes** — editable units derived from that response. Nodes can be edited, deleted, and arranged as parent/child units without rewriting the source response.
3. **Model Context** — only Working Nodes explicitly marked **Share with model** are included. The extension inserts that context into the current prompt composer when the user requests it. It does not submit the prompt.

The default is private: newly captured nodes are not shared with the model.

## Technology

- Electron 45 desktop shell, with `contextIsolation`, `sandbox`, and `nodeIntegration: false`.
- React 19 + TypeScript + Vite 8 renderer.
- Local JSON persistence in Electron's user-data directory for this initial vertical slice.
- Chromium Manifest V3 extension for ChatGPT, Claude, and DeepSeek pages.
- An authenticated HTTP bridge bound only to `127.0.0.1:43821`.

The use of local JSON storage is intentional for the first working slice, not a claim that JSON is the final long-term storage engine. A versioned storage boundary exists so the persistence layer can be replaced with SQLite without coupling the UI to the file format.

## Run the desktop app

Requirements: Node.js 22.12+ (or a current supported LTS release) and npm.

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm test
npm run typecheck
npm run build
```

On Windows, create an NSIS installer with:

```bash
npm run dist
```

## Pair the browser extension

1. Start WillAI-C desktop.
2. Open the connection control in the top-right corner, or copy the token on the first-run screen.
3. In Chrome or Edge, open `chrome://extensions` or `edge://extensions`.
4. Enable Developer mode and choose **Load unpacked**.
5. Select this repository's `extension` directory. In the Windows installer build, the same directory is copied into the app's `resources/extension` folder.
6. Open the extension popup and paste the desktop pairing token; choose **Save token & test connection**.
7. Open or refresh a supported AI conversation. Assistant responses will appear in WillAI-C after the page finishes updating.

The extension requests access only to the listed AI websites and the local WillAI-C bridge. It does not request access to all websites.

## Working with context

- Edit a node and choose **Save changes** to update the Working Node.
- Use **Add child** to create a related working unit.
- **Private edit** means the node stays in the local WillAI-C workspace.
- **Share with model** adds the node to the context preview for that source conversation.
- In the extension popup, choose **Insert shared context**. The text is inserted into the current composer for review. It is not submitted automatically.

The stored Original Response is not rewritten when nodes are edited or deleted.

## Current limitations

This is a functional foundation, not a finished release:

- AI websites change their DOM frequently. The extension uses provider-specific DOM selectors; capture may need selector updates when a provider changes its interface.
- The extension currently captures text responses and splits them into paragraph-like blocks. Rich media, file attachments, tool events, and exact provider message formatting are not yet represented as first-class data.
- DeepSeek and Claude selectors need real-browser verification across their current layouts and account variants.
- Refine and Explain are not automated model operations yet. Child-node creation and direct editing are implemented first; no provider API or background model call is hidden behind those controls.
- Shared context is currently scoped to the source conversation URL and is manually inserted by the user.
- There is no cloud sync, account system, or remote data collection.

## Privacy and local bridge

Captured content and the pairing token are stored on the local device. The desktop bridge binds to loopback (`127.0.0.1`), requires a random bearer token, validates supported provider URLs, and accepts requests only from browser-extension origins. The extension sends content only for the supported AI pages declared in its manifest.

The bridge port is fixed at `43821`. If another process is already using it, the desktop app reports the bridge as unavailable rather than silently exposing a different port.
