# WillAI-C — Initial Architecture

## Product boundary

WillAI-C is a desktop productivity environment that connects to existing browser-based AI accounts. It is not a model provider, an API aggregator, or an embedded browser. The user continues using ChatGPT, Claude, or DeepSeek in a normal browser tab; WillAI-C owns the editable work surface.

## Runtime components

```text
┌─────────────────────────────┐       ┌──────────────────────────────┐
│  ChatGPT / Claude / DeepSeek │       │       WillAI-C Desktop       │
│  normal browser tab         │       │                              │
│                             │       │  React renderer              │
│  Manifest V3 content script │──────▶│  Node / response workspace   │
│  captures assistant output  │ HTTP  │  Context inspector           │
│                             │       │            │                 │
│  Extension popup            │◀──────│  Local bridge (127.0.0.1)    │
│  inserts approved context   │ HTTP  │            │                 │
└─────────────────────────────┘       │  Local JSON persistence      │
                                      └──────────────────────────────┘
```

### Desktop process

- Electron main process owns the local store, local bridge, clipboard, and external-link opening.
- The React renderer has no Node integration. Its only privileged surface is the narrow API exposed through `contextBridge` in `preload.cjs`.
- The application never loads an AI provider page in its own window.

### Browser extension

- Manifest V3 extension, with explicit host permissions for ChatGPT, Claude, DeepSeek, and the loopback bridge.
- Provider adapters identify assistant response containers and wait for a quiet period before capture.
- Captures are sent to the desktop using a random pairing token. The extension does not read provider cookies or call private provider APIs.
- Context insertion is an explicit user action. The extension places a marked context block into the message composer and does not submit it.

## Canonical data distinction

### Original Response

An immutable capture record containing provider, source conversation URL, optional provider message identifier, capture timestamp, and original response text. Editing or deleting Working Nodes does not mutate this record.

### Working Node

A mutable unit derived from a captured response or created by the user. Each node contains:

- `id`, `responseId`, `parentId`, and `position`;
- current `content` and initial captured `initialContent`;
- `provenance` (`captured`, `human-edited`, or `human-created`);
- `includeInModelContext`, defaulting to `false`;
- creation/update timestamps and a soft-delete timestamp.

Deleting a parent currently soft-deletes its descendants as one subtree operation.

### Model Context

A derived view, not a second source of truth. It is constructed from non-deleted nodes whose `includeInModelContext` flag is true. Local edits remain private until the user turns this flag on. The extension retrieves this view only for the active source conversation.

## Data flow

1. Provider DOM adapter detects a stable assistant response.
2. Extension sends provider, source URL, title, message ID, raw text, and paragraph blocks to the local bridge.
3. The store deduplicates stable message IDs (or exact content fingerprints where IDs are absent).
4. The store persists the Original Response and initial Working Nodes.
5. The user edits, creates child nodes, or deletes a subtree in the desktop application.
6. The user explicitly marks chosen nodes as shared.
7. The extension popup requests the derived context for the active source URL.
8. The content script inserts a labelled context block at the start of the provider composer. The user reviews and submits it in the provider's own UI.

## Local bridge security

- Binds only to IPv4 loopback at `127.0.0.1:43821`.
- Uses a random 256-bit bearer token generated on first launch and persisted locally.
- Restricts capture URLs to HTTPS provider domains supported by the application.
- Limits request bodies and accepts only extension-origin CORS requests.
- Does not expose a general-purpose file, shell, or arbitrary IPC endpoint.

## Persistence boundary

The first slice uses a versioned JSON document under Electron's `userData` directory. Store operations are isolated behind `LocalStore`; UI and extension contracts do not depend on the disk representation. Before adding large-scale search, graph traversal, sync, or multi-user data, replace this adapter with SQLite and explicit schema migrations.

## Deliberately not implemented yet

- Provider API integration or API-key management.
- Automatic model generation for Refine / Explain.
- Cross-provider or cross-conversation context routing.
- Rich structured message AST for tables, images, files, citations, tool calls, and generated media.
- Collaborative editing, synchronization, or cloud storage.
- Full undo/redo and version history for Working Nodes.

These are not represented as implemented features in the UI. The first objective is a dependable local workflow around the Original Response / Working Nodes / Model Context distinction.
