# WillAI-C

**WillAI-C is a workspace-centered desktop application built on an integrated Chromium browser engine.** The WillAI-C workspace is the primary interface for conversations, captured responses, working nodes, prompts, notes, and other work. Chromium is the runtime that hosts ChatGPT, Claude, DeepSeek, Custom GPTs, and ordinary websites inside a managed browser dock; it is not the application's shell or the dominant interface.

WillAI-C uses the Chromium engine bundled with Electron. It does not launch or wrap the separately installed Google Chrome executable.

**WillAI-E Extension is a separate WillAI-family product for Chrome and Firefox.** It is not a dependency of WillAI-C and is not included in this repository.

## Current workspace-centered foundation

- A workspace-first application shell with conversation navigation and a central work canvas.
- Chromium pages hosted in native Electron `WebContentsView` tabs inside a separate browser dock.
- Browser tab strip, address/search bar, back, forward, reload, new tab, and tab closing within the dock.
- Persistent Chromium browser session partition for website sign-ins and site data.
- Browser-controlled website permission prompts and download save dialogs.
- Provider adapters for ChatGPT, Claude, and DeepSeek with visible adapter/capture diagnostics.
- Original Responses and editable Working Nodes stored in the WillAI workspace.
- Child nodes, provenance, deletion, and private-by-default node context.
- Explicitly selected context can be inserted into the active AI prompt composer. WillAI-C does not send the prompt automatically.

## Core data distinction

1. **Original Response** — the captured provider output, preserved independently.
2. **Working Nodes** — editable user work derived from or related to the response.
3. **Model Context** — only nodes the user explicitly chooses to share with the provider.

Editing or deleting Working Nodes does not rewrite the Original Response. Newly captured nodes are private by default.

## Technology

- Electron 45.3.2 (Chromium 156 line), React 19, TypeScript, and Vite 8.
- Electron `WebContentsView` for real browser pages, controlled by the main process.
- Persistent browser session partition `persist:willai-c-browser`.
- Context-isolated, sandboxed application and provider preloads.
- Local, versioned JSON persistence for the first response-workspace slice. This will be migrated to SQLite before the wider organization, search, and sync features are implemented.

Electron's documentation recommends `WebContentsView` over relying on the `<webview>` tag for embedding external pages. See [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view), [web embeds](https://www.electronjs.org/docs/latest/tutorial/web-embeds), and [security recommendations](https://www.electronjs.org/docs/latest/tutorial/security).

## Run locally

Requirements: Node.js 22.12+ and npm.

```bash
npm install
npm run dev
```

Checks:

```bash
npm test
npm run typecheck
npm run build
```

Create a Windows NSIS installer:

```bash
npm run dist
```

## Product scope

The complete supplied feature list—including folders, conversation tree maps, minimaps, highlights, global search, prompt management, prompt chains, audio/voice, notes, reference conversations, image gallery, GPT Store discovery, Showcase, sync, exports, and every stated Pro capability—is recorded in [docs/PRODUCT_SCOPE.md](docs/PRODUCT_SCOPE.md).

The architectural direction and module boundaries are recorded in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

This is an early workspace-centered foundation, not the finished feature-complete product. Provider capture still requires manual compatibility testing against current logged-in provider pages. Automated build success does not establish that live provider capture works correctly on a user's Windows machine.

## Privacy and security

- The provider page is remote, untrusted content. It does not receive Node.js or Electron APIs.
- Provider response capture uses an internal, context-isolated preload attached to the in-app browser tab. It does not require an extension or a localhost bridge.
- Browser profile data, provider sign-ins, captures, and Working Nodes are stored locally.
- Website permissions are prompted by WillAI-C.
- Shared Model Context is selected explicitly. Prompt insertion does not submit automatically.
- Cloud sync, public community prompts, Showcase sharing, and paid recipes are separate backend-dependent features; they are not silently enabled by the local browser foundation.
