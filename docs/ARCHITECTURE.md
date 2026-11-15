# WillAI-C — Browser-First Architecture

## 1. Correct product boundary

WillAI-C is a full Chromium-based browser application. A normal browser tab is the primary execution surface for ChatGPT, Claude, DeepSeek, Custom GPTs, and ordinary websites. WillAI's controls, browser chrome, response workspace, organization, prompt system, notes, and media tools belong to WillAI-C itself.

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

Each browser tab is an Electron `WebContentsView`. It is created and controlled by the main process, attached to the BrowserWindow's content view, and positioned underneath WillAI-C's browser chrome and side panels.

This is intentionally not an HTML `<webview>` element. Electron advises against relying on its `<webview>` tag and recommends alternatives such as `WebContentsView`. A `WebContentsView` is not part of the renderer DOM, so the React renderer reports the browser viewport rectangle to the main process; the main process sets the active view's bounds and hides inactive views by setting their bounds to zero.

### Renderer

React + TypeScript renders WillAI-C's application-owned interface:
- Tab strip.
- Address/search bar and navigation controls.
- AI workspace shortcuts and captured conversation list.
- Optional WillAI response panel.
- Working Node editor and Model Context controls.
- Future folders, search, prompts, notes, minimap, highlights, media, and export surfaces.

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

The provider preload runs in the isolated preload world, observes the supported provider page's DOM, and sends only response text/metadata through its private IPC channel. The main process verifies the sending WebContents and current provider origin before storing a capture. It does not read provider cookies or call private provider APIs.

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

The current capture and node foundation uses a versioned local JSON store. That is an implementation step, not the intended final storage engine.

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

Before the feature set grows beyond the current single-user capture workflow, move the mutable application data from the JSON document to SQLite with explicit schema migrations, indexed search, transactions, and recoverable backups. Do not make React components depend on JSON file structure.

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

Implemented in the current browser-first foundation:
- Chromium-backed WebContentsView browser tabs inside WillAI-C.
- Address/search navigation, back, forward, reload, new tab, close tab, and provider shortcuts.
- Persistent Chromium browser session partition.
- Site permission prompts and browser download save prompts.
- Internal provider capture preload for ChatGPT, Claude, and DeepSeek.
- Response and Working Node storage.
- Private-by-default Working Nodes and explicit model context.
- In-browser context insertion without automatic prompt submission.

Not implemented yet:
- The full folders, prompt, sync, search, notes, community, export, audio, image, GPT Store, Showcase, and Pro features in the product scope.
- Rich response AST and provider-specific structured block capture.
- Session restore UI, bookmarks, and full history management.
- Automated compatibility tests against live provider websites.
- Packaged Windows/macOS/Linux release validation.

## 9. Initial development sequence

1. Stabilize Chromium browser shell: tabs, URL entry, navigation, persistent session, downloads, permissions, crash recovery, and keyboard focus.
2. Verify provider capture and model-context insertion manually on current ChatGPT, Claude, and DeepSeek sessions.
3. Replace JSON storage with SQLite and migration tests before adding broad workspace objects.
4. Build core conversation organization: folders, pins, timestamps, highlights, notes, bulk actions, global search, and temporary/archive/delete rules.
5. Build the prompt system and composer integrations.
6. Add export/print, audio/voice, image gallery, and GPT discovery.
7. Add optional sync, community prompts, Showcase, paid recipes, and centralized Pro entitlements.

The Pro features remain part of the product requirements from the beginning, but their service dependencies and licensing are implemented when the corresponding base capabilities exist.
