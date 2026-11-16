# WillAI-C — Current Continuation Status

**Repository:** `willlilywork/WillAI-C`  
**Active rewrite branch:** `rewrite/rust-native-windows`  
**Baseline:** clean Rust native foundation, version `0.1.0`  
**Previous Electron release:** `0.3.1` (superseded; not the new codebase)

## Decision

The previous Electron/Node.js/React/TypeScript/Vite implementation is retired from the working tree. Do not continue that code, port its BrowserController, or reapply its WebContentsView patches.

The replacement is a native Windows application written in Rust:
- Rust 2024 for application logic.
- Microsoft `windows-reactor` 0.100 for the WinUI 3 native view tree.
- Microsoft `windows-webview` 0.100 with the `reactor` feature for the embedded WebView2 control.
- `windows-reactor-setup` for self-contained Windows App SDK deployment.

The browser is composed as a child view in the same WinUI tree as the workspace. Its geometry is managed by native WinUI layout, not by manually positioning a separate browser window.

## What exists in the Rust foundation

- Cargo project and Windows x64 MSVC toolchain configuration.
- Rust application entry point.
- Workspace-first start screen.
- ChatGPT, Claude, and DeepSeek provider selection.
- Embedded WebView2 control inside the WinUI layout tree.
- Basic navigation controls (back, forward, reload, address, go).
- HTTP(S)-only address normalization and unit tests.

## What does not exist yet

- Automated prompt insertion/submission.
- Assistant response detection and structured capture.
- SQLite persistence and migrations.
- Original Response / Working Document / Working Node data layer.
- Editable rich-content workbench.
- Explicit Model Context selection and preview.
- Prompt, notes, folder, search, export, sync, entitlement, and media systems.
- A production installer or authenticated-provider end-to-end validation.

Do not describe any of these as implemented until source code and tests actually exist.

## Required sequence for continued development

1. Stabilize the native shell and confirm WebView2 view lifecycle, clipping, resizing, focus, and shutdown on Windows.
2. Implement a typed browser/session service and secure provider navigation policy.
3. Implement the local SQLite repository and the core record model.
4. Implement faithful assistant response capture with structured content blocks.
5. Implement Original Response, Working Document, Working Nodes, provenance, relations, and explicit Model Context.
6. Add prompt submission only after the browser and capture foundations are independently verified.
7. Add the remaining product modules from `docs/PRODUCT_SCOPE.md`.

## Rules for future changes

- `main` remains the acceptance branch. Merge only a reviewed, green Rust implementation.
- Do not reintroduce Electron, npm, Node.js, React, TypeScript, Vite, or JavaScript application modules.
- Keep application UI and product logic in Rust.
- WebView2 hosts provider web pages; it is not the application shell.
- Do not implement browser geometry by creating a detached top-level window or by manually overlaying a browser rectangle.
- A passing Rust unit test does not prove a signed-in provider accepted a prompt or that an authenticated response was captured.
- Every claim of completion must point to implementation and relevant test evidence.
