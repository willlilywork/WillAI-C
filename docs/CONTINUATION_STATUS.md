# WillAI-C — Engineering Handoff

**Snapshot date:** 2026-11-15  
**Repository:** https://github.com/willlilywork/WillAI-C

> This document is a point-in-time handoff, not a substitute for checking GitHub. Before changing code, verify the current branch heads, pull-request states, and latest CI runs. Update this file when the implementation state changes materially.

## 1. Resume here

- **Active integration branch:** `rebuild/desktop-first-foundation`
- **Latest implementation merge in the integration branch:** `7e457d32e457182953d08a3bc1071bd26118eeb3` (PR #9 squash merge). Later commits on this branch only update this handoff document; always verify the current branch tip before editing.
- **GitHub default branch:** `main` (currently an older, separate state; do not assume it contains the current rebuild).
- **Do not merge the rebuild into `main` yet.** The browser/provider path still requires live testing with signed-in accounts and manual validation of the packaged Windows application.
- **Open PR #1:** [Build WillAI-C as a Chromium browser with integrated WillAI](https://github.com/willlilywork/WillAI-C/pull/1). It targets `main` from `rebuild/desktop-first-foundation`, remains a Draft, and must stay unmerged until the manual validation gate is satisfied.
- **Merged PR #9:** [Send provider requests in the background and return captured responses to Work](https://github.com/willlilywork/WillAI-C/pull/9). It was merged into `rebuild/desktop-first-foundation` after its corrected CI run passed. The merged commit is `7e457d32e457182953d08a3bc1071bd26118eeb3`.
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

PR #9 is merged into rebuild/desktop-first-foundation:

- **PR:** [#9 — Send provider requests in the background and return captured responses to Work](https://github.com/willlilywork/WillAI-C/pull/9)
- **Corrected feature commit:** ce6363a2da18ba8e08b107fe0e605fa2f6e3962f
- **Squash merge commit:** 7e457d32e457182953d08a3bc1071bd26118eeb3

The New Conversation flow now sends a request through the selected in-app provider session:

1. The main process reuses or opens a provider tab and waits for the isolated adapter to report readiness.
2. The provider preload inserts the prompt into the provider composer and looks for an enabled provider-specific send control.
3. The provider preload activates that control and reports the local result to the main process.
4. The provider response observer monitors assistant content, waits for it to stabilise, and sends the captured content through the validated capture channel.
5. The main process validates the originating WebContents/provider and persists the Original Response in SQLite; the workspace is notified separately.

The provider send acknowledgement proves only that the page's enabled send control was clicked. It is **not** proof that the remote service accepted the request, completed generation, or that the response was captured and persisted. Live, signed-in end-to-end tests remain mandatory.

The first CI run on the earlier code commit passed npm test but failed npm run typecheck; an App.tsx edit had removed still-used navigateTo and toggleNodeContext functions. Both were restored in corrected commit ce6363a. The corrected PR #9 CI run passed before merge. Post-merge verification is now complete; see Section 5.

## 5. Verification status

### Current GitHub state checked on 2026-11-15

- **Active integration branch:** rebuild/desktop-first-foundation.
- **Implementation commit:** 7e457d32e457182953d08a3bc1071bd26118eeb3 (PR #9 merge); two later commits updated the handoff only. The verified branch head at the time of this check was f91e1c3ea6287a3f7f7a8ddb3126e552c1d87b2d.
- **PR #9:** merged into the integration branch.
- **PR #1:** open and Draft; base branch is main. Keep it unmerged until manual provider and packaged-app validation are complete.
- **Default branch:** main remains the older, separate state at 576258b74d600b6e5486c323597a6b38d49f8782. Do not assume it contains the current rebuild.

### Confirmed automated checks

On implementation/handoff commit f91e1c3ea6287a3f7f7a8ddb3126e552c1d87b2d:

- [CI run #84](https://github.com/willlilywork/WillAI-C/actions/runs/43772920458) — completed successfully on the pull-request event.
- [CI run #83](https://github.com/willlilywork/WillAI-C/actions/runs/43772915090) — completed successfully on push.
- [Windows test build #28](https://github.com/willlilywork/WillAI-C/actions/runs/43772915081) — completed successfully. The job installed dependencies, ran tests and type checking, built the renderer, checked Electron entry points, rebuilt SQLite for Electron, packaged the Windows installer, generated SHA-256 checksums, and uploaded the artifact.
- Windows artifact: WillAI-C-Windows-x64-28 (artifact ID 14185001888).

These runs confirm automated code/build/package integrity for that commit. They do **not** prove that the installer was manually installed and exercised, that real signed-in provider requests work, or that provider selectors still match the latest live websites.

### Not yet validated manually

Do not claim these are working until tested in the actual packaged desktop app with current signed-in provider sessions:

1. Send a fresh prompt through ChatGPT, Claude, and DeepSeek separately.
2. Confirm the provider page actually submits the request. A local send-button click acknowledgement is not remote acceptance.
3. Confirm the completed assistant response is captured, associated with the correct provider/conversation, persisted in SQLite, and rendered in Work.
4. Compare captured Markdown with each provider's own Copy output; verify headings, lists, nested lists, tables, code blocks, links, and other supported formatting are not flattened.
5. Confirm the provider page remains hidden while New Conversation stays visible, and that Browser can be opened to inspect or recover an unsuccessful request.
6. Install and relaunch the packaged Windows app. Verify sign-in/session persistence, SQLite persistence, and legacy JSON migration/recovery against existing local workspace data.

Provider DOM selectors can change without notice. Automated structural tests and a successful installer build cannot establish live selector compatibility or manual runtime behavior.

## 6. Immediate continuation sequence

1. Download artifact WillAI-C-Windows-x64-28 and manually install/run it on Windows, including relaunch and upgrade tests with existing workspace data.
2. Run the live provider smoke tests in Section 5 with signed-in ChatGPT, Claude, and DeepSeek sessions. Treat the provider send-button click acknowledgement as submission initiation, not remote acceptance or response completion.
3. Fix any live provider submission/capture issues found. Verify Markdown fidelity against each provider's Copy output and confirm the correct response is persisted once in SQLite.
4. Recheck the SQLite migration, legacy backup, and local browser-session persistence in the packaged application.
5. Keep PR #1 as Draft. Do not merge the integration branch into main until live provider behavior and packaged-Windows validation are confirmed.
6. Continue against the complete feature register in docs/PRODUCT_SCOPE.md, checking existing code first so functionality is not duplicated.

The automated Linux CI and Windows packaging workflows are green on the verified implementation commit. The outstanding release gate is manual provider and packaged-app validation, not another rebuild from scratch.

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

Work directly in the repository. The active integration branch is `rebuild/desktop-first-foundation`; do not confuse it with `main`. PR #9's background provider submission pipeline is already merged into this branch; verify the post-merge CI state, then validate the provider submission and response-capture flow in the packaged desktop app. Do not merge into `main` until live signed-in provider testing and manual packaged-Windows validation are complete.

Preserve the workspace-centered architecture, the separation between Original Response / Working Nodes / explicit Model Context, the SQLite local source of truth, and the provider security boundary. Do not reintroduce a Chrome extension or external-browser dependency into WillAI-C. Make concrete code changes, tests, and commits; avoid repeating product analysis or proposing a new architecture unless current evidence requires it.
