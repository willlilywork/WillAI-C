# WillAI-C — Engineering Handoff

**Snapshot:** 2026-11-15  
**Repository:** https://github.com/willlilywork/WillAI-C  
**Current product version:** 0.3.0

## Branch and acceptance policy

- `main` is the product acceptance branch. The success or failure of the application is judged from what is built and tested from `main`.
- The integration branch is `rebuild/desktop-first-foundation`. It contains the full rebuild and WillAI-C 0.3.0 workspace-organization changes; `main` now includes them.
- PR #1 was merged into `main` on 2026-11-15. Merge commit: `2004144618e712a3548038e118eaa1499ddc940d`.
- PR #10 (0.3.0 folder organization and bulk actions) was squash-merged into the integration branch as `7752ec64aef46ad869d7f8b89047779aedd81c72` and is included in `main` through PR #1.
- PR #9 (background provider submission) and PR #8 (SQLite/FTS5) are already included in the integration branch.
- Do not create another parallel implementation from the old initial snapshot. Continue from `main`, which is the acceptance and source-of-truth branch. The integration branch is now one merge commit behind `main`.

## Product and architecture — preserve these decisions

WillAI-C is a **workspace-centered desktop application** with an integrated Chromium engine. The workspace owns conversations, captured responses, Working Nodes, prompts, notes, and search. Browser pages are managed work surfaces inside the app; the browser must not become the dominant application shell.

- Runtime: Electron with Chromium-backed `WebContentsView` tabs, not a wrapper around the user's separately installed Chrome.
- ChatGPT, Claude, DeepSeek, and ordinary sites run in the app's persistent browser profile. Do not introduce an external Chrome dependency, an extension dependency, or undocumented/private provider APIs.
- **WillAI-E Extension is a separate product** and is not part of this repository.
- Remote provider pages are untrusted. Preserve sandboxing, context isolation, separate preloads, sender checks, provider-origin checks, and the current IPC trust boundary.
- New Conversation is the default entry surface. Opening a provider must not replace the workspace shell.
- Keep three different records separate:
  1. **Original Response:** immutable captured source output.
  2. **Working Nodes:** editable work derived from or associated with the source response.
  3. **Model Context:** only nodes a user explicitly chooses to share; private by default.
- Editing/deleting Working Nodes must never rewrite the Original Response. Never silently include private nodes in provider prompts.
- SQLite is the local source of truth in the Electron main process. Renderer access is through authenticated IPC/preload APIs.

Read `docs/ARCHITECTURE.md` for module/security boundaries and `docs/PRODUCT_SCOPE.md` for the complete feature register. The register describes total product scope, not a claim that every feature is present.

## Implemented foundation in 0.3.0

### Workspace and browser
- Workspace-first shell with New Conversation as startup, global navigation, contextual sidebar, resizable navigation and context panels.
- Integrated Chromium tabs, address/search, navigation, persistent browser session, popup handling, permissions and download prompts.
- Browser history and bookmarks.
- Global workspace search backed by SQLite FTS5.

### Responses and provider connection
- Internal provider capture adapters for ChatGPT, Claude, and DeepSeek.
- Background submission path using the user's existing signed-in provider page; send initiation, remote response completion, capture and persistence are separate states.
- Captured assistant output stored as Original Responses; Markdown parsing creates nested editable Working Nodes.
- Node editing, creation, deletion, sibling/child operations, reordering, and explicit Model Context selection.
- A manual "Extract loaded responses" rescan action for currently rendered conversation messages.
- **Important verification boundary:** live provider DOM compatibility and end-to-end ChatGPT / Claude / DeepSeek operation still require manual signed-in testing. A send-button click acknowledgement is not proof of remote acceptance or completed capture.

### Local productivity
- Folder/subfolder creation, folder editing for name/colour/icon, drag-and-drop conversation filing, and drag-and-drop folder nesting.
- Folder reparent operations reject moves that would create a parent/descendant cycle.
- Conversation pinning, archiving, restoration, and bulk deletion.
- Bulk archive/restore and bulk move to a folder or Unfiled.
- Prompt Manager with variables, favourites, usage history, JSON import/export, and manual prompt queue.
- Global and per-conversation notes, conversation references, and explicit context sharing.
- Markdown, TXT, HTML, JSON and PDF conversation exports.
- SQLite persistence with WAL, foreign keys, indexes, schema versioning, FTS5, and one-time legacy JSON migration. The source JSON file and migrated backup are retained.

## 0.3.0 changes in PR #10

- Drag a conversation onto a folder to file it; drop on All conversations to move it to Unfiled.
- Drag a folder onto another folder to nest it; drop on All conversations to move it to root.
- Edit folder names, colours, and icons.
- Archive/restore selected conversations as one operation.
- Move selected conversations to a folder or Unfiled as one operation.
- Added store regression tests for hierarchy cycles and batch actions, plus renderer/IPC wiring checks.

## Verification state

GitHub Actions run #106 passed on PR #10 head `e9284bdb6060c455c69600dc62335ac32afd2175`:
- `npm test`
- `npm run typecheck`
- `npm run build`
- Electron main/preload syntax checks

Post-merge run #108 passed on `7752ec64aef46ad869d7f8b89047779aedd81c72`. Run #110 passed on the subsequent integration-branch documentation update `6035de7eb1b0634f3b2f8d68e6d037074a9fcc53`.

PR #1 integrated the complete rebuild into `main` with merge commit `2004144618e712a3548038e118eaa1499ddc940d`. At the time of this update, the GitHub integration did not expose the push-triggered Actions run for this merge commit, so the `main` push result must be checked before recording main-branch CI as passed. The preceding integration-branch code and build checks passed; this does not substitute for the main acceptance run.

### Still requires real runtime verification
These are not proven by tests or packaging alone:
1. Send prompts through current signed-in ChatGPT, Claude, and DeepSeek accounts.
2. Confirm each provider accepts the request, finishes generation, and the completed response is captured once under the correct conversation/provider.
3. Compare captured content with the provider's own Copy output, including headings, nested lists, tables, code, links, citations, and rich content.
4. Install and launch the packaged Windows build; verify sign-in/session persistence, SQLite restart behavior, and legacy JSON migration with existing data.

Do not claim these tests passed without an actual run in the packaged app.

## Product-scope items still outstanding

The full feature list remains in `docs/PRODUCT_SCOPE.md`. Among the larger unfinished groups:
- Folder images, right-side folder panel, automatic folders for Custom GPTs, automatic retention jobs, and cross-device sync.
- Conversation tree map/PNG export, minimap, highlights/annotations, advanced message and prompt navigation, long-chat loading controls, and full-chat find.
- Prompt optimization, automatic prompt queue, executable chains, slash autocomplete, arrow-key recall, context menus, public prompt/community features, smart replacement, and instruction profiles.
- Additional AI interaction controls, ChatGPT settings/appearance overlays, split/summarize tools, and screenshot workflows.
- Selected-message and bulk/ZIP export, print templates, audio/voice/speech tools, image gallery, Showcase, paid recipes, GPT discovery, and newsletter archive.
- Pro entitlements, cloud sync, community services, sharing/marketplace backend, and payments.

Do not insert inert controls or label a feature implemented just because it is described in the product register.

## Development checks

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

Package Windows:
```bash
npm run dist
```

Windows CI now builds the branch that triggered the workflow, including `main`. Use the `main` build as the acceptance build. A successful CI run proves automated checks and packaging; manual provider and installer validation remain distinct.
