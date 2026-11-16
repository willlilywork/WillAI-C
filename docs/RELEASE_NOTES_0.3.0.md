# WillAI-C 0.3.0 — Workspace Organization

## Added

- Drag conversations onto folders to file them; drop onto **All conversations** to move them to Unfiled.
- Drag folders onto other folders to nest them; drop onto **All conversations** to move them to the root.
- Folder moves reject self-parenting and ancestor/descendant cycles.
- Edit folder names, colours, and icons in the Work sidebar.
- Archive or restore selected conversations in bulk.
- Move selected conversations to a folder or Unfiled in bulk.
- Windows test builds now run for both `rebuild/desktop-first-foundation` and `main`, and package the branch that triggered the workflow.

## Verification included

- Local-store regression tests for folder nesting, cycle prevention, batched archive/restore, and batched moves.
- Renderer/IPC contract tests for the drag/drop and bulk-action paths.
- Existing application tests, TypeScript checks, production renderer build, Electron syntax checks, and Windows packaging.

## Not included

This release does not implement the remaining product-register items such as conversation maps, minimaps, highlights/annotations, prompt chains that execute automatically, voice/media workflows, cloud sync, Showcase, GPT discovery, or Pro entitlements. The live provider submission/capture path still requires signed-in manual verification.
