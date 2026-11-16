# WillAI-C — Workspace-Centered Architecture

## 1. Correct product boundary

WillAI-C is a workspace-centered desktop application whose browser engine is Chromium. Chromium is the runtime and embedded web-content engine used to access ChatGPT, Claude, DeepSeek, Custom GPTs, and ordinary websites. It is not the product's application shell and must not dominate the interface.

The WillAI-C workspace is the primary application surface. Conversation organization, prompts, notes, response artifacts, search, and work tools belong to that workspace. Browser tabs and web pages are integrated work surfaces that the workspace controls and presents in a docked or focused view. A captured response becomes a first-class workspace object; it must not remain trapped in a browser tab or an optional side panel.

WillAI-C is not a chat sidebar attached to external Chrome. It does not ask the user to install an extension in Chrome to make the desktop application work. It does not open AI websites in an external browser.

**WillAI-E Extension is a separate product** in the WillAI family. It adds WillAI features to Chrome and Firefox. No WillAI-E source code, extension manifest, or extension-to-localhost bridge belongs in this repository.

### Chromium versus Google Chrome

The browser engine is Chromium, bundled by Electron. This gives WillAI-C its own browser runtime and release lifecycle. It is not the separately installed Google Chrome executable or a renamed copy of Chrome. The current dependency line is Electron 45, based on Chromium 156; Electron 45.3.2 is used because that is the stable package available from npm during this implementation.

## 2. Browser runtime

### Main process

Electron's main process owns:
- The application window and browser tabs.
- A persistent Chromium Session partition (`persist:willai-c-browser`) for website authentication, cookies, cache, and local storage.
- A `BrowserController` that creates, positions, navigates, activates, and closes browser pages.
- Navigation policy, popup-to-tab routing, download destination prompts, and site permission prompts.
- Local data persistence and the trusted IPC boundary to the WillAI renderer.
- Provider capture events received from the internal page preload.

### Native web page views

Each browser tab is an Electron `WebContentsView`. It is created and controlled by the main process, attached to the BrowserWindow's content view, and positioned exactly inside the browser surface assigned by the WillAI workspace. Its bounds must never cover the workspace navigation, response canvas, or application controls.

This is intentionally not an HTML `<webview>` element. Electron advises against relying on its `<webview>` tag and recommends alternatives such as `WebContentsView`. A `WebContentsView` is not part of the renderer DOM, so the React renderer reports the browser viewport rectangle to the main process; the main process sets the active view's bounds and hides inactive views by setting their bounds to zero.

### Renderer

React + TypeScript renders the primary WillAI-C application:
- Workspace navigation, conversation library, and search.
- Central workspace canvas for conversations, Original Responses, Working Nodes, and Model Context.
- Integrated browser dock with its own tab/address/navigation controls.
- Visible provider-adapter health and capture diagnostics.
- Future folders, prompts, notes, minimap, highlights, media, and export surfaces.

The workspace is always present. The browser is a managed surface inside that application; it can be shown, hidden, or focused without replacing the workspace shell.

The React renderer does not render the provider's page in an iframe. The provider page is its own Chromium WebContentsView, not an HTML child owned by React.

### Browser page security

Remote browser content is untrusted:
- `nodeIntegration: false`.
- `contextIsolation: true`.
- `sandbox: true`.
- `webSecurity: true`.
- The provider preload is separate from the application preload.
- No Node.js or Electron API is exposed to provider page JavaScript.
- Renderer IPC handlers validate the sender.
- Navigation to non-HTTP(S) schemes is blocked.
- Site permissions are prompted by WillAI-C instead of being silently granted.

The provider preload runs in the isolated preload world, observes the supported provider page's DOM, and sends only response text/metadata through its private IPC channel. It also reports whether its adapter loaded, how many candidate message elements it can see, and any capture error. The main process verifies the sending WebContents and current provider origin before storing a capture, then reports success or failure to the workspace. It does not read provider cookies or call private provider APIs. A zero-capture state must be diagnosable in the UI; it must never be presented as proof that capture is working.

## 3. Internal provider integration

Supported initial providers:
- ChatGPT: `chatgpt.com` and legacy `chat.openai.com`.
- Claude: `claude.ai`.
- DeepSeek: `deepseek.com` and its supported subdomains.

Each provider has its own adapter/selectors. A provider adapter:
1. Identifies assistant-response containers, not user prompts.
2. Waits for response content to remain stable before capturing.
3. extracts text and paragraph-like blocks plus an available source message identifier.
4. Sends the data through the WebContents preload IPC channel.
5. Leaves the visible provider page and its own account/session in place.

Provider sites change their DOM frequently. Selectors are compatibility adapters, not a guaranteed provider API. They require regression tests and live browser verification after provider UI changes. Rich content such as images, audio, video, tables, tool calls, and citations needs a structured message model beyond the initial text capture.

## 4. WillAI response data

The first implementation preserves the three separate concepts:

### Original Response

An immutable captured record:
- Provider and source conversation URL.
- Source message identifier when available.
- Original text and capture timestamp.
- Content fingerprint for deduplication.

Edits to nodes must never mutate this source record.

### Working Nodes

Mutable working units associated with an Original Response:
- Stable node ID, parent ID, order, content, and initial content.
- Provenance: captured, human-edited, or human-created.
- Created/updated/deleted timestamps.
- Explicit `includeInModelContext` flag, false by default.

Nodes can be edited, created as children, and deleted as a subtree. Later versions must add split/merge, cross-message relations, undo/redo, version history, structured block types, and node-level selection.

### Model Context

A derived projection of Working Nodes marked for sharing. Local edits remain private until explicitly enabled. When the user chooses **Insert shared context**, the application sends the selected projection to the active provider page through the isolated preload. It is inserted into the prompt composer for review; it is never automatically submitted.

This distinction is mandatory across all provider adapters and future prompt features. An Original Response, a user's Working Nodes, and the text supplied to a model are not interchangeable records.

## 5. Local persistence and future data model

The local workspace now uses SQLite through a transactional repository in the Electron main process. Existing JSON workspace files are migrated on first startup and retained as a separate legacy backup after a successful import.

The target local data model must include at least:
- BrowserProfile, BrowserSettings, BrowserPermission, Bookmark, BrowserHistoryEntry, TabSession.
- Conversation, Message, OriginalResponse, ResponseBlock, WorkingNode, NodeRelation, Highlight, Annotation, PinnedMessage.
- Folder, FolderRule, TemporaryConversation, ConversationReference.
- ChatNote, GlobalNote.
- Prompt, PromptVariable, PromptVersion, PromptHistoryEntry, FavoritePrompt, PromptQueueItem, PromptChain, PromptChainStep, InstructionProfile, SmartReplacement.
- MediaAsset, ImageGalleryItem, AudioAsset, ExportJob.
- CustomGPTReference, GPTStoreEntry.
- SyncState, Device, Entitlement, PlanFeature.
- CommunityPrompt, PromptVote, PromptReport, ShareLink, ShowcasePage, PaidRecipe, Purchase.

Use a local-first repository boundary so that local browsing, node editing, notes, prompt history, and core search do not require the WillAI cloud. Cloud services are introduced only for features that inherently need cross-device sync, public community discovery, share pages, subscriptions, or paid marketplace transactions.

SQLite is the source of truth for mutable local data. The schema separates folders, conversations, Original Responses, Working Nodes, prompts, notes, browser records, and queue items; foreign keys, indexes, WAL mode, and an FTS5 search index are maintained by the main-process store. Schema evolution uses SQLite's user_version, and the legacy JSON file is not overwritten during migration. React communicates through the IPC repository surface and does not access database files.

## 6. Product feature modules

The detailed, user-supplied feature list and Pro boundaries are recorded in [PRODUCT_SCOPE.md](./PRODUCT_SCOPE.md). The intended modules are:

1. **Browser Core** — tabs, sessions, navigation, history, downloads, permission/site settings, keyboard routing, privacy, and browser profile.
2. **Conversation Workspace** — folders/subfolders, colors/images, drag-and-drop, pins, conversation tree map, minimap, highlights, annotations, timestamps, bulk operations, lifecycle rules, temporary mode, and search.
3. **Prompt System** — prompt manager, variables, optimizer, queue, chains, history, autocomplete, favorites, public prompt discovery/sharing/import/export, smart replacement, and instruction profiles.
4. **AI Interaction Layer** — language, tone/style, model identity, composer behavior, splitting/summarization, copy modes, formatting, word counts, scroll controls, and ad-card handling.
5. **Response Workbench** — immutable Original Responses, Working Nodes, provenance, relations, selected Model Context, refinements, explanations, and response-level navigation.
6. **Knowledge and References** — chat notes, global notes, conversation references, global search, and contextual retrieval.
7. **Media and Exports** — image gallery, audio controls, voice, speech-to-text, text-to-speech, PDF/JSON/Markdown/HTML/TXT export, bulk export, selected-message export, and print layouts.
8. **GPT Discovery and Showcase** — Custom GPT discovery, public image/prompt pages, community recipes, paid recipes, gallery sharing, voting, reports, and filters.
9. **Sync and Account Services** — optional cross-device sync, public prompt service, user accounts, subscription entitlements, marketplace payments, and Pro support.
10. **Entitlements** — centralized server-verifiable Pro features and limits. Pro gating must not be scattered as UI-only conditionals.

## 7. Security and privacy principles

- Provider pages run as untrusted remote content and do not receive application privileges.
- Local data and prompt history stay on the user's device unless a feature explicitly syncs or publishes them.
- Sharing model context is an explicit user action.
- Browser permissions are requested per website and type.
- Public prompt/share/Showcase services require explicit publication and clear ownership.
- Sync uses authenticated devices and encrypted transport; the storage/encryption design must be specified before implementing cloud sync.
- Paid recipes and image sales require a real backend entitlement and payment design; no client-only flag grants access.

## 8. Current implementation status

Implemented in the current integration branch:

- New Conversation is the default starting surface in a workspace-centered Electron application.
- Chromium-backed WebContentsView tabs are managed inside an integrated Browser dock. The workspace remains visible and owns the application shell.
- The New Conversation submission path reuses or opens the selected provider tab, waits for its isolated adapter, inserts the prompt, and activates the provider's enabled send control. The provider page can continue loading and submitting while its native view is hidden from the workspace.
- Provider adapters for ChatGPT, Claude, and DeepSeek report readiness, message-element discovery, and capture errors.
- The provider observer monitors assistant content, waits for it to stabilise, converts supported DOM content to Markdown, and sends it to the main process. The main process validates the source tab/provider and persists the Original Response.
- Original Responses remain separate from editable, nested Working Nodes. Working Nodes are private by default and only explicitly selected nodes enter Model Context.
- SQLite is the local source of truth through a transactional main-process repository. The schema uses foreign keys, indexes, WAL mode, schema versioning, and FTS5. Legacy JSON data is migrated and retained as a backup.
- The local productivity slice includes folders/subfolders, conversation pin/archive/bulk actions, prompt management with variables/favourites/history/import/export, a manually submitted prompt queue, global and conversation notes, conversation references, bookmarks/history, and Markdown/TXT/HTML/JSON/PDF conversation export.
- GitHub Actions currently verifies tests, TypeScript, the renderer build, Electron syntax, and the Windows installer packaging workflow.

### Submission acknowledgement boundary

A successful willai:prompt-submit-result means the provider page's enabled send control was activated. It does not prove remote acceptance, generation completion, or successful capture. Response detection, persistence, and the workspace update are separate events. Do not represent a send-button click as proof of an end-to-end successful request.

The separate **Insert shared context** action only inserts the selected context into the provider composer for review; it does not submit. The prompt queue also inserts items for manual submission. These behaviors must not be conflated with the New Conversation **Send request** path.

Still not verified or implemented:

- Live end-to-end submission and response capture against current signed-in ChatGPT, Claude, and DeepSeek sessions. Confirm the remote request proceeds, the completed answer is captured once, Markdown formatting is preserved, the correct provider/conversation is associated, and the result appears in Work.
- Manual installation and operation of the packaged Windows application, including relaunch, existing workspace data, browser sign-in/session persistence, and legacy JSON migration/recovery. A green Windows packaging workflow is not a substitute for this test.
- Packaged macOS/Linux release validation.
- Provider-specific structured response AST and full fidelity for rich content such as images, audio, video, citations, and interactive tool output. Current capture is a Markdown-oriented text path.
- The remaining product-scope features not listed as implemented in [PRODUCT_SCOPE.md](./PRODUCT_SCOPE.md), including conversation tree maps, minimaps, highlights/annotations, advanced message navigation, advanced prompt automation, voice/media features, GPT discovery, Showcase, cloud sync, community services, and Pro entitlements.



## 9. Immediate continuation sequence

1. Run live smoke tests with signed-in ChatGPT, Claude, and DeepSeek sessions. For each provider, verify adapter readiness, prompt insertion, send-control activation, remote request progress, completed response capture, correct provider/conversation association, Markdown fidelity, and deduplication.
2. Install the Windows x64 test artifact manually. Test a fresh install and an upgrade/relaunch with existing local workspace data; verify provider sign-ins, SQLite persistence, and the legacy JSON migration/backup path.
3. Fix any provider-specific selector, submission, or capture failures found by those tests. Keep send initiation, remote response completion, and persistence as independently observable states.
4. Continue implementation against the complete feature register in [PRODUCT_SCOPE.md](./PRODUCT_SCOPE.md), checking the existing repository before adding functionality so delivered features are not duplicated.
5. Keep PR #1 as Draft and do not merge the integration branch into main until the live provider and packaged Windows validation gates are satisfied.

The Pro features remain part of the product requirements from the beginning, but their service dependencies and licensing are implemented when the corresponding base capabilities exist.
