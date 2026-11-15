# WillAI-C — Engineering Handoff

**Snapshot date:** 2026-11-15  
**Repository:** https://github.com/willlilywork/WillAI-C

> This document is a point-in-time handoff, not a substitute for checking GitHub. Before changing code, verify the current branch heads, pull-request states, and latest CI runs. Update this file when the implementation state changes materially.

## 1. Resume here

- **Active integration branch:** `rebuild/desktop-first-foundation`
- **Integration branch commit at this snapshot:** `f233ab6667484002c5cb6f379443e7db5513fa4d`
- **GitHub default branch:** `main` (currently an older, separate state; do not assume it contains the current rebuild).
- **Do not merge the rebuild into `main` yet.** The browser/provider path still requires live testing with signed-in accounts and manual validation of the packaged Windows application.
- **Open PR #1:** [Build WillAI-C as a Chromium browser with integrated WillAI](https://github.com/willlilywork/WillAI-C/pull/1). It targets `main` from `rebuild/desktop-first-foundation`, remains a Draft, and must stay unmerged until the manual validation gate is satisfied.
- **Open PR #9:** [Send provider requests in the background and return captured responses to Work](https://github.com/willlilywork/WillAI-C/pull/9). It targets `rebuild/desktop-first-foundation`; details and the latest CI state are below.
- **Merged PR #8:** [Move WillAI-C local workspace storage to SQLite with FTS5 search](https://github.com/willlilywork/WillAI-C/pull/8). It is already included in the integration branch.

## 2. Product and architecture — decisions that must not be reversed accidentally

WillAI-C is a **workspace-centered desktop application** with an integrated Chromium engine. The WillAI workspace is the primary interface for conversations, saved responses, Working Nodes, prompts, notes, and search. The browser is a managed, integrated work surface/dock; it must not replace or dominate the workspace.

- Runtime: Electron with Chromium-backed `WebContentsView` tabs. This is not a wrapper around the separately installed Google Chrome executable.
- The provider pages run inside WillAI-C using the user's existing signed-in web sessions. Do not introduce an extension dependency, an external Chrome dependency, provider API keys, or undocumented/private provider APIs.
- **WillAI-E Extension is a separate product** for Chrome and Firefox. It is not part of this repository.
- Remote provider pages are untrusted. Keep Node/Electron APIs out of provider-page JavaScript; preserve context isolation, sandboxing, separate preloads, sender checks, HTTPS/provider-origin checks, and the existing IPC trust boundary.
- Default entry surface is **New Conversation**. The app owns the workspace shell; opening a provider page must not make the browser the entire app.
- The three response concepts are distinct:
  1. **Original Response:** the captured provider output, retained as the source record.
  2. **Working Nodes:** editable work derived from or associated with that response.
  3. **Model Context:** only the nodes the user explicitly selects to share with a provider; private by default.
- Editing/deleting a Working Node must not rewrite the Original Response. Do not silently include private nodes in prompts.

Read `docs/ARCHITECTURE.md` for module and security boundaries, and `docs/PRODUCT_SCOPE.md` for the full user-supplied feature register. The feature register is the target scope, **not proof that every listed feature is implemented**.

## 3. Current implementation in the integration branch

The integration branch contains the workspace-first shell and the earlier local productivity slice, including:

- New Conversation as the initial workspace view; global rail and contextual sidebar.
- A managed integrated Browser dock with tab navigation, address/search, back/forward/reload, and persistent browser profile/session.
- Provider adapters and capture diagnostics for ChatGPT, Claude, and DeepSeek.
- Original Response / Working Node storage and Markdown-to-node parsing; editable nested nodes and explicit Model Context selection.
- Workspace features including folders/subfolders, pin/archive/bulk conversation actions, Prompt Manager, prompt variables/history/queue, global and per-chat notes, conversation references, bookmarks/history, conversation exports, and global search.
- SQLite local persistence with FTS5 search, indexes, foreign keys, WAL, transactional writes, schema versioning, and migration from legacy `willai-c-data.json`. The original JSON file is preserved and a migrated backup is retained after successful migration.

The current local source of truth is SQLite in the Electron main process; the React renderer reaches it through the IPC/repository surface. Native SQLite is rebuilt for the system Node ABI for tests and the Electron ABI for desktop execution/package.

## 4. PR #9 — background provider submission

PR #9 changes the New Conversation flow from “open provider and insert prompt for manual submission” to an attempted background submission flow:

- Main-process `sendPrompt(provider, content)` reuses or opens the provider's in-app tab and waits for the isolated adapter to report readiness.
- The provider WebContentsView is kept out of the visible workspace while the request is being submitted.
- The isolated provider preload inserts into the provider composer and looks for an enabled provider-specific send button.
- The provider page reports whether the send button was clicked. This is **not** proof that the remote service accepted the request or completed a response.
- The existing response-capture path is expected to capture and persist the completed response; that complete live end-to-end path has not yet been verified.
- If a selector is unsupported, the flow should return an error rather than falsely report success.

**Latest PR #9 code commit at this snapshot:** `ce6363a2da18ba8e08b107fe0e605fa2f6e3962f`  
**Previous PR #9 commit:** `37c90385559e56b5edff032ef6034fb4093d8866`

The first CI run for the previous commit passed `npm test` but failed `npm run typecheck`; build and syntax-check steps were skipped. Inspection found that the App.tsx edit had accidentally removed the still-used `navigateTo` and `toggleNodeContext` functions. Both functions were restored in commit `ce6363a`.

**CI for the corrected PR #9 commit was still running at the time this snapshot was written.** Check the latest run/checks on the current PR head before deciding whether the fix is sufficient. Do not call PR #9 green based on the earlier test step alone.

## 5. Verification status

### Confirmed automated checks

On integration branch commit `f233ab6667484002c5cb6f379443e7db5513fa4d`:

- The main CI verification run completed successfully.
- The Windows test-build workflow completed successfully (workflow run #24).
- PR #8's CI verification completed successfully before merge.
- PR #9's first run completed with unit tests passing and TypeScript checking failing; the missing helpers have since been restored, but a fresh successful CI result is still required.

A successful Windows CI build is **not** the same as installing and manually exercising the packaged application on Windows.

### Not yet validated manually

Do not claim these are working until tested in the actual desktop app with current provider pages and signed-in user sessions:

1. Send a fresh prompt through ChatGPT, Claude, and DeepSeek separately.
2. Confirm the prompt is actually submitted by the provider page, not merely inserted or accepted by a local click handler.
3. Confirm a completed assistant response is captured, associated with the right provider/conversation, persisted in SQLite, and rendered in Work.
4. Confirm Markdown formatting and nested Working Nodes are preserved rather than flattening the answer into one plain-text node.
5. Confirm the provider page can remain hidden while the New Conversation workspace remains visible, and that Browser can be opened to inspect/recover an unsuccessful request.
6. Relaunch the packaged Windows app and verify session persistence, SQLite persistence, and legacy JSON migration/recovery behavior.

Provider DOM selectors can change without notice. Automated structural tests cannot establish live selector compatibility.

## 6. Immediate continuation sequence

1. **Check PR #9 and its latest CI run** at the current head. If TypeScript still fails, inspect the exact diagnostics and fix them; do not merge on the strength of unit tests alone.
2. Once all PR #9 CI jobs pass, review the final diff and merge PR #9 into `rebuild/desktop-first-foundation` only.
3. Run the manual provider smoke tests above. Treat a button click acknowledgement as submission initiation, not remote acceptance or response completion.
4. Test the packaged Windows build manually, including an upgrade/relaunch against existing local workspace data.
5. Update `README.md` and the implementation-status section of `docs/ARCHITECTURE.md`: the README still contains old JSON-persistence statements that conflict with the merged SQLite implementation. After PR #9 is merged, also update descriptions that still say prompt submission is manual.
6. Keep PR #1 as Draft until live provider behavior and packaged Windows validation are confirmed. Only then consider merging the integration branch into `main`.
7. Continue implementation against the complete feature register in `docs/PRODUCT_SCOPE.md`, checking existing code first so functionality is not duplicated.

## 7. Development commands

Requirements: Node.js 22.12+ and npm.

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

Create a Windows installer:

```bash
npm run dist
```

The scripts rebuild `better-sqlite3` for the correct Node/Electron ABI. Do not remove the rebuild steps without testing both `npm test` and the Electron runtime/package.

## 8. Copy/paste starter prompt for a new ChatGPT conversation

Continue development of the existing **WillAI-C** repository: https://github.com/willlilywork/WillAI-C.

First read `docs/CONTINUATION_STATUS.md`, `docs/ARCHITECTURE.md`, and `docs/PRODUCT_SCOPE.md` from the repository. Then verify live GitHub branch heads, PR #1, PR #9, and the latest CI results; the handoff document is a snapshot and may be stale.

Work directly in the repository. The active integration branch is `rebuild/desktop-first-foundation`; do not confuse it with `main`. Continue from the actual code and current CI state, not from assumptions in the handoff. Resolve PR #9's remaining CI issues first, then validate the background provider submission and response-capture flow. Do not merge into `main` until live signed-in provider testing and manual packaged-Windows validation are complete.

Preserve the workspace-centered architecture, the separation between Original Response / Working Nodes / explicit Model Context, the SQLite local source of truth, and the provider security boundary. Do not reintroduce a Chrome extension or external-browser dependency into WillAI-C. Make concrete code changes, tests, and commits; avoid repeating product analysis or proposing a new architecture unless current evidence requires it.
