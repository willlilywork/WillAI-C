# WillAI-C 0.3.1 — Provider Reliability Repair

## Fixed

- Provider WebContentsViews no longer have Chromium background timer throttling enabled while they are hidden behind the workspace. This keeps provider-side observers and retry/stability timers running while the user stays in New Conversation.
- Prompt insertion now uses CDP `Input.insertText` against the provider WebContents as the primary path. Electron native `insertText` remains as a fallback only.
- The adapter verifies the full normalized prompt text is present in the provider composer before it clicks Send. A partial or empty insertion is rejected without submission.
- ChatGPT selectors now cover the newer `data-conversation-role`, `data-markdown-text-style="assistant-message"`, and `data-chatgpt-composer` ProseMirror structures.
- Claude response capture now recognizes `.font-claude-response` alongside the older structure.
- Stable message identifiers are resolved through ancestor turn/message attributes.
- Provider DOM attribute changes are observed, including streaming/role state.
- Non-breaking-space and carriage-return normalization was corrected.

## Regression coverage

- CDP insertion is exercised with a mocked hidden WebContents; the test proves the primary path does not call native OS focus.
- The Electron insertion fallback is exercised when CDP attachment fails.
- The real provider preload script is executed inside DOM fixtures. A partial prompt is rejected, a complete multiline prompt is submitted, and ChatGPT/Claude response fixtures produce Original Response capture payloads.
- The full automated test, typecheck, renderer build, and Electron syntax-check workflow passes on the repair branch.

## Boundary

The tests validate the app-side submission/capture bridge and representative current DOM structures. They do not simulate provider sign-in, provider-side acceptance, account restrictions, or remote service availability.
