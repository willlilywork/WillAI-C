# WillAI-C Interface Prototype

An isolated, clickable desktop UI prototype based on the current WillAI-C interface direction.

## Run

This is a static prototype with no build step or application dependencies.

From the repository root:

```bash
python -m http.server 4173 --directory prototype/interface
```

Then open http://127.0.0.1:4173 in a desktop browser.

Alternatively, open `index.html` directly. Serving it over localhost is recommended for consistent browser behavior.

## Screens

- **New Conversation** — default entry screen. Write a request, choose ChatGPT, Claude, or DeepSeek, and use the mock submit flow.
- **Conversation response** — demonstrates where the selected provider's returned answer is intended to appear inside WillAI-C as a response node. The screen is explicitly labelled simulated.
- **Conversations Tree** — a separate canvas showing message nodes, connected paths, current and alternate path styling, zoom controls, and **Branch in new chat**.
- **Home** — secondary workspace overview with recent work and quick actions.
- **Work** — conversation library, provider filtering, search, folders, and working documents.
- **Conversation** — readable message timeline with headings, lists, block quote, code, table, and message actions.
- **Response Workbench** — Original / Working / Context Preview modes, editable block demo, selected-block actions, and generated child artifact with parent metadata.
- **Browser** — full-canvas provider page mock with tabs, navigation controls, and explicit disconnected/capture status.
- **Prompts** — prompt list, editor, variable preview, and insert-only interaction.
- **Notes** — global and conversation notes plus reference-picker placeholder.
- **Media** — representative image/audio/download/export library.
- **Global Search / Command Palette** — open with `Ctrl+K` or the search button.

## Prototype interactions

- The prototype opens to **New Conversation**.
- Select a provider, type a prompt, and click Send (or press Enter). The next view demonstrates the response-node destination but does not generate a real model answer.
- Open **Conversations Tree** from the global rail. The sample graph begins as a linear path. Select **Branch in new chat** on a message node to add an alternate branch; use +, −, or Fit to adjust the canvas zoom.
- In Work, type in search and change the provider filter.
- Open a sample conversation, then choose **Open in Workbench**.
- In Workbench, switch between Original, Working, and Context Preview.
- Select a content block to reveal its selection state; use Explain or Refine to add a child artifact, or Add to context to include it in the context preview.
- Open the context panel from the top bar and switch between Outline, Assistant, and Context.
- In Prompts, change the variable value and observe the resolved preview; insertion is simulated and is not submitted.
- In Browser, switch mock tabs and edit the address field. No external website is loaded.
- `Ctrl+K` opens search/commands, `Ctrl+B` toggles the navigation pane, and `Esc` closes the palette.

## Boundaries

This prototype uses hard-coded local mock data and client-side state only. It does **not** connect to ChatGPT, Claude, DeepSeek, signed-in provider accounts, Electron, the WillAI-C data store, or any cloud service. Submitting a prompt only demonstrates the intended navigation and display flow. It does not send a real request or capture a response. The response node is a placeholder, not model output.

The intended real application flow is: WillAI-C sends a request through the selected provider's linked signed-in browser session in the background, then captures the completed provider answer and displays it as structured response nodes in the same WillAI-C conversation view. That integration is not implemented by this HTML prototype.

This folder is isolated from `src/renderer`, the Electron main process, browser session, provider preloads, IPC, and production persistence. Do not treat prototype interactions as delivered application features.

## Validation

Run the syntax and structure check:

```bash
node prototype/interface/check.mjs
```

The Playwright review runner exercises the new conversation flow, provider selection, Conversations Tree branching, existing workspaces, immutable Original Response, Model Context selection, and responsive layouts:

```bash
node prototype/interface/capture-review.mjs
```
