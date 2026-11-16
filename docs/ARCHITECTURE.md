# WillAI-C — Rust Native Architecture

## 1. Rewrite boundary

WillAI-C is being rebuilt from a clean implementation. The former Electron/Node.js/React/TypeScript/Vite codebase is not part of this architecture and must not be reintroduced.

The application itself is Rust. Its native UI is authored through Microsoft's `windows-reactor` library, which provides a declarative Rust component model over native WinUI 3 controls. The embedded provider browser is Microsoft's WebView2 control, integrated into the same Reactor view tree using the `reactor` feature of `windows-webview`.

Remote websites loaded inside WebView2 remain web applications written and delivered by their respective providers. They are untrusted content; they are not the implementation language or UI framework of WillAI-C.

## 2. Target platform

The first rewrite target is Windows 10/11 x64. This is an intentional choice because the required browser integration is directly supported by Microsoft's WinUI 3 + WebView2 Rust stack.

Cross-platform support is not claimed. A future macOS or Linux port would require a separate native UI/browser host implementation and must not compromise the Windows architecture.

## 3. Application stack

| Responsibility | Technology | Ownership |
|---|---|---|
| Application language | Rust 2024 | All product logic and application code |
| Window and native controls | `windows-reactor` / WinUI 3 | Native view tree, layout, focus, accessibility |
| Browser control | `windows-webview` / WebView2 | Embedded web content, navigation, profile, scripts, page events |
| Browser engine | Microsoft Edge WebView2 (Chromium) | Remote website rendering |
| Runtime deployment | `windows-reactor-setup` | Windows App SDK and WebView2 projection deployment |
| Local persistence | SQLite, through a Rust data layer | Future local source of truth |
| Search | SQLite FTS5 / Rust query layer | Future local full-text search |
| Packaging | Cargo + Windows-native packaging | Future signed installer |

No Electron, Node.js runtime, npm package manager, React renderer, TypeScript build, Vite server, preload scripts, or browser extension is required by the desktop application.

## 4. Native workspace and browser composition

The application window is owned by WinUI 3. The workspace shell and browser control are native views in one WinUI visual tree.

The browser must be created as a Reactor WebView2 view (via `webview_result` / `webview` from `windows-webview` with its `reactor` feature), not as an independent top-level browser window. The browser is a child of the workspace's content layout. Its bounds are therefore assigned by the WinUI layout system; app code must not compute a renderer rectangle and place an overlapping browser window over it.

Required behavior:
- The app starts on the WillAI-C workspace / New Conversation surface.
- Provider pages appear only inside the designated browser content region.
- The global app rail, workspace navigation, and browser controls remain native WillAI-C controls.
- Resizing the window, changing layout width, and navigating between workspace surfaces must preserve correct WebView2 sizing and clipping.
- When the browser view is removed, its controller/event registrations are released in a defined order.
- If browser initialization fails, the workspace displays the error rather than opening an external browser or showing a detached window.

The native view tree is the boundary that prevents the previous "floating page" failure mode. This is a structural change, not a CSS fix.

## 5. Component and state model

Each feature is implemented as a Rust component with:
- explicit owned state;
- typed messages describing user and system events;
- update logic that changes state;
- a view function that describes native controls;
- narrow interfaces to persistence and provider/browser services.

Browser operations are asynchronous where WebView2 requires callbacks. Callback results return to the component through typed messages. Event registrations are retained for the lifetime of the browser component and dropped before its WebView handle.

Long-running parsing, capture normalization, indexing, and import/export work must not block the WinUI UI thread. Background work uses Rust tasks/threads and returns typed results to the owning component.

## 6. Core product records

The architecture must preserve these independent data concepts:

- **Workspace** — the local WillAI-C environment.
- **Conversation** — a provider-side discussion with a local identity and source.
- **Message** — a user or assistant turn captured from a conversation.
- **Original Response** — immutable source content, provenance, provider identity, capture time, and source reference.
- **Working Document** — editable content derived from an Original Response.
- **Working Block / Node** — an addressable paragraph, heading, list item, code block, quote, table, or other supported content block. Rich structure must not be flattened into one plain-text field.
- **Relation** — semantic links between blocks, nodes, conversations, notes, references, and other records.
- **AI-generated child artifact** — an explanation, refinement, summary, or other result linked to its selected parent.
- **Model Context** — the exact, user-approved projection of selected content that will be provided to a model. Excluded by default.
- **Prompt** — reusable user-authored input.
- **Note** — user-authored knowledge or reference material.
- **Browser Session / Tab** — a persistent WebView2 profile and a specific provider/site page.

Parent-child nesting does not replace semantic relations. Editing a Working Document must never mutate the Original Response.

## 7. Data and persistence direction

The application is local-first. SQLite is intended to be the local source of truth for conversations, messages, Original Responses, Working Documents, nodes, relations, prompts, notes, browser metadata, and preferences.

Persistence must be behind Rust repository interfaces. UI components must not issue ad-hoc SQL. The initial schema must use foreign keys, indexes, transactions, migration versioning, and FTS5 where available. Database work is not yet implemented in this foundation build.

Cloud services are out of process and optional. Sync, public prompt discovery, community sharing, subscriptions, and paid storefront features require explicit service boundaries and must not make core local use depend on a cloud account.

## 8. Provider integration and safety

Initial browser providers:
- ChatGPT: `chatgpt.com`.
- Claude: `claude.ai`.
- DeepSeek: `chat.deepseek.com`.

Provider integration must use the user's normal signed-in WebView2 browser session. It must not require provider API keys for the browser-based flow.

Provider adapters must:
1. identify user and assistant messages without treating labels/toolbars as content;
2. detect generation state and wait for stable assistant content;
3. preserve rich structure instead of flattening the entire reply;
4. capture only the content and metadata needed by WillAI-C;
5. report readiness, unsupported page structure, and capture failures accurately;
6. avoid private provider APIs and never attempt to read provider passwords or session secrets.

All remote page content is untrusted. Application capabilities are exposed only through narrow, explicit WebView2 messaging. The app must validate origin, navigation, message shape, and expected provider before accepting browser-originated data. Do not enable blanket host privileges for provider pages.

Provider DOM structures can change. Selectors are adapters, not stable provider APIs. Each supported provider requires fixture tests and a Windows integration test against the actual WebView2 runtime; passing mocked fixtures alone is not evidence of live provider acceptance.

## 9. Testing and release quality

Required validation layers:
- Rust unit tests for parsing, URL policy, state transitions, data models, and serialization.
- Rust integration tests for repositories, migration, relationships, response structure, and context inclusion rules.
- Windows WebView2 integration tests for navigation, resizing, clipping, focus, session persistence, page messaging, and shutdown.
- Provider-specific regression tests for supported DOM variations.
- Release build and packaging tests on Windows x64.

The browser-layout acceptance test must resize the main window and surrounding panels and verify that the WebView2 control remains entirely within its native layout cell. A screenshot of a web page drawn outside the app window is a release-blocking defect.

CI currently begins with formatting, Rust tests, and Windows compilation. The browser-layout and authenticated-provider integration suites are not yet implemented.

## 10. Explicit non-goals for the foundation build

The first Rust foundation does not claim to implement:
- automatic prompt submission into provider composers;
- automatic response capture and persistence;
- SQLite data storage or migration;
- Working Nodes, their rich editor, or Model Context assembly;
- prompt management, notes, folders, or exports;
- cloud sync, accounts, payments, or community services.

Those are product requirements, but must be built against this new architecture and separately verified.
