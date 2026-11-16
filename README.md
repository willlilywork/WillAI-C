# WillAI-C

**WillAI-C is a workspace-centered desktop application with its own integrated Chromium runtime.** The WillAI workspace is the primary interface for conversations, captured responses, Working Nodes, prompts, notes, and other work. Chromium hosts ChatGPT, Claude, DeepSeek, Custom GPTs, and ordinary websites in a managed browser dock; it is not the application shell.

WillAI-C uses the Chromium engine bundled by Electron. It does not launch or wrap the separately installed Google Chrome executable.

**WillAI-E Extension is a separate WillAI-family product for Chrome and Firefox.** It is not included in this repository and is not a dependency of WillAI-C.

## Current implementation

- New Conversation is the default starting surface.
- A request submitted from New Conversation is routed through the selected provider's existing signed-in session. WillAI-C keeps the provider page hidden and uses CDP text input against its focused composer rather than relying on native OS focus of a hidden view. It verifies the complete prompt is present before activating the provider's Send control.
- ChatGPT, Claude, and DeepSeek provider adapters expose readiness and capture diagnostics. The selectors include the current ChatGPT assistant-markdown/composer structure, Claude's `.font-claude-response` content, and DeepSeek's `.ds-markdown` responses.
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

- **New Conversation — Send request:** WillAI-C inserts the prompt into the selected provider composer, verifies that the complete normalized text is present, and activates the provider's enabled send control. The result confirms that the provider page indicated submission/generation; it cannot prove remote-service acceptance or completed response capture.
- **Insert shared Model Context / prompt-queue item:** content is inserted into the active provider composer for review. This action does not submit it. Prompt-queue items are still submitted manually, one at a time.

The provider pipeline now avoids Chromium background timer throttling for hidden provider views, uses CDP-first insertion, rejects partial prompt insertion, and includes DOM fixtures for the current ChatGPT and Claude response structures. The automated tests verify these application-side paths; they do not emulate provider authentication, remote service acceptance, rate limits, or provider-side failures.

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

GitHub Actions runs the automated test suite, TypeScript checks, production renderer build, Electron syntax checks, and a Windows x64 installer workflow for the acceptance branch. Passing these checks confirms build integrity and packaging, not that the installer has been manually installed or that live provider sessions have been validated.

Before treating provider integration as validated, test real signed-in ChatGPT, Claude, and DeepSeek sessions, confirm prompt submission and completed-response capture, compare captured Markdown with each provider's Copy output, and verify persistence after restarting the packaged Windows application.
