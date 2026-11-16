# WillAI-C

**WillAI-C is a workspace-centered desktop application with its own integrated Chromium runtime.** The WillAI workspace is the primary interface for conversations, captured responses, Working Nodes, prompts, notes, and other work. Chromium hosts ChatGPT, Claude, DeepSeek, Custom GPTs, and ordinary websites in a managed browser dock; it is not the application shell.

WillAI-C uses the Chromium engine bundled by Electron. It does not launch or wrap the separately installed Google Chrome executable.

**WillAI-E Extension is a separate WillAI-family product for Chrome and Firefox.** It is not included in this repository and is not a dependency of WillAI-C.

## Current implementation

- New Conversation is the default starting surface.
- A request submitted from New Conversation is routed through the selected provider's existing signed-in session. WillAI-C reuses or opens an in-app provider tab, submits through its isolated adapter, and keeps that browser surface hidden while the workspace remains visible.
- ChatGPT, Claude, and DeepSeek provider adapters expose readiness and capture diagnostics.
- Assistant responses are monitored, converted to Markdown text, validated in the main process, and saved as Original Responses in the local workspace. Markdown content is parsed into editable, nested Working Nodes.
- The integrated Browser dock provides tabs, address/search, navigation, persistent site sessions, permission prompts, and download dialogs.
- Local workspace tools include folders and subfolders, editable folder names/colours/icons, drag-and-drop filing and nesting, conversation pin/archive, bulk archive/restore/move/delete actions, a Prompt Manager with variables/favourites/history and JSON import/export, a manual prompt queue, global and conversation notes, conversation references, bookmarks/history, and conversation exports.

## Response and submission boundaries

The application keeps three concepts separate:

1. **Original Response** — the captured provider output, retained as the source record.
2. **Working Nodes** — editable work derived from or associated with that response.
3. **Model Context** — only nodes the user explicitly chooses to share with a provider.

Editing or deleting a Working Node does not rewrite the Original Response. Nodes are private by default.

There are two different submission paths:

- **New Conversation — Send request:** WillAI-C inserts the prompt into the selected provider composer and activates the provider's enabled send control. The local acknowledgement confirms that the page's send control was clicked; it does not prove that the remote service accepted the request or completed a response. Response capture is a separate step.
- **Insert shared Model Context / prompt-queue item:** content is inserted into the active provider composer for review. This action does not submit it. Prompt-queue items are still submitted manually, one at a time.

Live compatibility with current signed-in provider pages remains to be verified manually. Automated checks do not establish that provider selectors continue to match their live interfaces or that a complete response is reliably captured.

## Local data

The local workspace uses SQLite through the Electron main-process repository (better-sqlite3). It uses transactional writes, foreign keys, indexes, WAL mode, schema versioning, and FTS5 search. Existing legacy JSON workspace data is migrated on startup and retained as a separate migrated backup after a successful import. The React renderer accesses the store through the IPC/repository surface; it does not access the database file directly.

Browser profile data, provider sign-ins, captures, and Working Nodes remain local. Cloud sync, public sharing, community services, Showcase hosting, and paid features require separate backend services and are not silently enabled by this local foundation.

## Technology

- Electron 45.3.2 (Chromium 156 line)
- React 19 and TypeScript
- Vite 8
- Electron WebContentsView for managed Chromium pages
- Sandboxed, context-isolated application and provider preloads
- SQLite via better-sqlite3

Electron recommends WebContentsView rather than relying on the webview tag for embedding external pages. See [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view), [web embeds](https://www.electronjs.org/docs/latest/tutorial/web-embeds), and [security recommendations](https://www.electronjs.org/docs/latest/tutorial/security).

## Run locally

Requirements: Node.js 22.12+ and npm.

~~~bash
npm install
npm run dev
~~~

Checks:

~~~bash
npm test
npm run typecheck
npm run build
~~~

Create a Windows NSIS installer:

~~~bash
npm run dist
~~~

The scripts rebuild the native SQLite module for the correct Node.js or Electron ABI.

## Product scope and verification

The complete supplied feature list and its implementation boundaries are recorded in [docs/PRODUCT_SCOPE.md](docs/PRODUCT_SCOPE.md). The architecture and security boundaries are recorded in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The latest verified continuation state and outstanding manual tests are recorded in [docs/CONTINUATION_STATUS.md](docs/CONTINUATION_STATUS.md).

On implementation commit f91e1c3ea628, GitHub Actions Linux checks passed and the Windows x64 workflow built and published a test installer. These are automated build results, not a claim that the installer has been manually installed and exercised.

Before treating provider integration as validated, test real signed-in ChatGPT, Claude, and DeepSeek sessions, confirm prompt submission and completed-response capture, compare captured Markdown with each provider's Copy output, and verify persistence after restarting the packaged Windows application.
