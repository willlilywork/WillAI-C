# WillAI-C — Product Scope and Feature Register

## Product definition

**WillAI-C is a workspace-centered desktop application built on an integrated Chromium browser engine.** Chromium is the runtime and web-content engine; it is not the application's shell or the dominant interface. The WillAI-C workspace is the central interface for conversations, Original Responses, Working Nodes, prompts, notes, search, and other work. Browser pages are integrated surfaces managed by the workspace and can be docked or focused without replacing it.

WillAI-C does not require provider API keys for its browser-based AI integrations. It works with the user's existing signed-in web accounts. Provider responses must become visible, retrievable workspace objects while preserving the Original Response and controlling what is included in later model context.

**WillAI-E Extension is a separate member of the WillAI product family.** It is the Chrome and Firefox extension that adds WillAI features on top of those browsers. It is not part of the WillAI-C application, and WillAI-C does not depend on an extension or a localhost extension bridge.

## Platform and boundary

- Browser engine: the Chromium build bundled with Electron. This is a Chromium-based browser application, not a launcher for the separately installed Google Chrome executable.
- Browser pages run in their own web contents and persistent browser session.
- The WillAI-C workspace is the primary application interface; browser tabs and navigation are integrated controls within it.
- Browser WebContents must be bounded to the browser surface and must never cover the workspace navigation, central work canvas, or app controls.
- Captured responses are first-class workspace records, not content shown only in a browser page or an optional secondary panel.
- Provider-specific integration is internal to WillAI-C. Provider page integration must not grant a website access to Node.js or Electron APIs.
- WillAI-C's local features work without a WillAI cloud account. Features explicitly requiring sync, public sharing, community voting, paid content, or storefronts need separate backend services.
- No feature in this register should be represented as implemented merely because it appears in the product specification. Implementation status is tracked in the repository's issues and release plan.

## Feature register

### 1. Browser foundation

- Chromium browser embedded as the core runtime of WillAI-C.
- Multi-tab browsing, navigation, address/search bar, back/forward/reload, new tabs, and tab management.
- Persistent browser profile for website sign-ins, cookies, cache, and local site data.
- Browser history, downloads, site permissions, and popup handling.
- In-browser access to ChatGPT, Claude, DeepSeek, other AI providers, and ordinary websites.
- Workspace-centered interface with a managed Chromium browser dock.
- Integrated response capture, diagnostics, and workspace-side response editing.
- Internal provider adapters; no WillAI-C browser extension or extension-to-app HTTP bridge.

### 2. Conversation and workspace organization

- **More Sidebar Space:** resize the sidebar and bottom section to make more of the conversation list visible.
- **Folders and Subfolders:** organize chats with colors, images, drag-and-drop, and pinned favorites.
- **Conversation Tree Map:** visualize multi-branch conversations and export as PNG.
- **Minimap:** show a reduced overview of the entire conversation on the edge of the screen.
- **Text Highlights with Annotations:** highlight in multiple colors, add annotations, search highlights, and reopen them later.
- **Pinned Messages:** pin individual messages for quick access from the navigation sidebar.
- **Timestamps:** show timestamps for chats and individual messages.
- **Bulk Delete and Bulk Actions:** select and manage multiple chats or folders at once.
- **Auto Delete and Auto Archive:** automatically clean up older conversations after a user-defined number of days.
- **Automatic Folders:** create folders automatically for conversations started with Custom GPTs.
- **Global Search:** search across chats, prompts, notes, and highlights, with result highlighting.
- **Temporary Mode:** return to temporary chats and continue them at any time.
- **Auto Sync:** synchronize settings, folders, prompts, and chat history across devices.
- **Right-side Folder Panel:** display the same folder and subfolder structure in a right-side panel, including when ChatGPT's native sidebar is closed or the browser window is too narrow to show it.
- **Message Navigator Filters:** filter the navigator to show only the user's messages or only ChatGPT's messages, and group messages by day.
- **Long-chat Performance Controls:** let the user choose how many messages load at a time, keep only the latest messages loaded to reduce browser lag, and automatically load older messages as the user scrolls.
- **One-click Full Conversation Loading:** provide an action that loads and renders every message in a long conversation immediately, without reloading the page.
- **Full-chat Find (Ctrl+F / Cmd+F):** search across the entire conversation, including messages not currently rendered or visible on screen, and jump directly to each matching result.

### 3. Prompt management and reuse

- **Advanced Prompt Manager:** manage an unlimited number of prompts in one central place.
- **Prompt Optimizer:** improve a prompt with one click before sending it.
- **Prompt Queue:** queue multiple prompts and send them automatically, one after another.
- **Prompt Chains:** save and execute a series of prompts with one click.
- **Prompt Variables:** use double-curly-brace variables, for example `{{topic}}`, in reusable templates.
- **Prompt History:** save and browse every prompt privately on the local computer.
- **Prompt Auto Complete:** open a prompt menu by typing `/` above the input box.
- **Quick Access to Previous Prompts:** navigate prompt history from the input box with the Up/Down arrow keys.
- **Prompt Navigator:** list every prompt in a conversation in a sidebar, allow filtering and searching that list, and jump to any earlier prompt with one click, including in very long chats.
- **Favorite Prompts:** mark prompts from history as favorites for reuse.
- **Prompt Search:** search local prompt history and thousands of public community prompts.
- **Public Prompts:** share, vote, report, sort, and filter community prompts by category and language.
- **Prompt Sharing:** create direct links to community prompts.
- **Prompt Import and Export:** back up, share, or migrate prompt collections.
- **Right-click Menu:** access and run saved custom prompts on any website.
- **Smart Replace:** automatically replace short phrases with longer saved text while typing.
- **Custom Instruction Profiles:** create and switch between multiple instruction sets.
- **Custom Instruction:** automatically append a selected custom instruction to each prompt.
- **Auto Click:** automatically click the default favorite-prompt button at the end of each response.

### 4. AI interaction and response controls

- **Language Selection:** change the response language with one click, supporting more than 190 languages.
- **Tone and Writing Style:** change the tone and writing style of ChatGPT responses.
- **Model Switcher:** switch models in the middle of a conversation and show which model produced each response.
- **Copy and Paste with Formatting:** support plain text, Markdown, and HTML.
- **Copy Mode:** choose whether to copy both user input and response or only the response.
- **Word and Character Count:** count words and characters in user inputs and responses.
- **Custom Conversation Width:** adjust conversation width.
- **Scroll Controls:** move to the top, bottom, or one message at a time.
- **Keyboard Shortcuts:** provide quick access to frequently used features.
- **Block Ads on ChatGPT:** hide sponsored ad cards from conversation responses.
- **Disable Enter to Submit:** require CMD/CTRL + Enter to send a prompt.
- **Auto Splitter:** split long inputs into smaller chunks and send them individually.
- **Auto Summarize:** summarize long text using Auto Splitter to make it easier to question.
- **Send Screenshot with Right Click:** send a screenshot from any page to ChatGPT quickly.

### ChatGPT page integration and appearance

- **Dark Mode Support for the New ChatGPT Interface:** support dark mode in ChatGPT's newer interface, including WillAI-C's integrated browser-side controls and overlays.
- **Embedded Settings Panel:** provide a settings panel directly within the ChatGPT page, with enough room to keep the current conversation visible for preview while the user reviews and changes every available option.

### 5. Export, print, audio, and voice

- **Export Conversations:** export in PDF, TXT, JSON, Markdown, and HTML.
- **Bulk PDF Export:** create a ZIP containing individual PDFs, with templates and filename mapping.
- **Select and Export Individual Messages:** choose specific messages from a conversation for export.
- **Print Conversations:** produce print-ready pages with polished templates.
- **Audio Controls:** listen to full conversations with playback speed, volume, transcript, and download options.
- **Download Audio:** download ChatGPT response audio and full-conversation audio as MP3.
- **Side-by-Side Voice Mode:** use ChatGPT Advanced Voice while viewing the conversation.
- **Text-to-Speech and Speech-to-Text:** provide multilingual text and voice input/output.
- **Voice Mode Transcript Integration:** capture and display the actual words spoken in Voice Mode messages in the message navigator and search index, rather than showing a generic “Untitled” label.

### 6. Notes and knowledge context

- **Chat Notes:** save notes for each chat; make them searchable and synchronized across devices.
- **Global Notes:** keep notes available across the entire workspace.
- **Reference Conversations:** attach one or more past conversations as context for a new chat.

### 7. Images, Custom GPT discovery, and Showcase

- **Image Gallery:** browse, search, inspect prompts for, and download images from ChatGPT conversations.
- **Showcase:** create public share pages for ChatGPT images, including titles, descriptions, creator notes, and reusable prompt recipes.
- **Paid Prompt Recipes:** sell reusable prompt recipes and original image downloads through Showcase.
- **Gallery Sharing:** share images as a carousel, grid, or collage.
- **Download Conversation Images:** download images from a conversation without locating each message manually.
- **Enhanced GPT Store:** discover more than 100,000 Custom GPTs and try them with one click.
- **Newsletter Archive:** access and read previous newsletter versions.

## Pro plan capabilities

The following items are explicitly designated as Pro capabilities in the supplied product definition. They must be enforced by a centralized entitlement system, not by hiding controls only in the UI.

- **Advanced Conversation Audio Player (Pro):** floating player, playback speed, skip controls, volume, transcript, separate voices, message delays, and MP3 download.
- **Unlimited workspace collections (Pro):** unlimited folders, prompts, queue items, profiles, notes, and pinned messages.
- **Full Conversation Tree Map (Pro):** no message limit, branches, exports, and image support.
- **Advanced Prompt Automation (Pro):** unlimited prompt chains, prompt variables, smart prompt steps, and prompt import/export.
- **Unlimited Highlights (Pro):** unlimited highlights and annotations, with colors, source context, and notes.
- **Automatic Conversation Management (Pro):** automatic folders, auto delete, and auto archive; priority support.
- **Full GPT Store Discovery (Pro):** full searchable GPT Store discovery layer.
- **Advanced Export and Print (Pro):** bulk exports, folder exports, selected-message exports, and full print templates.
- **Unlimited References and Profiles (Pro):** unlimited reference chats and unlimited custom instruction profiles.

## Implementation status at the browser-foundation milestone

Implemented in the current foundation:
- Chromium pages are rendered inside WillAI-C through Electron `WebContentsView`, not in an external browser.
- Browser tabs, address/search navigation, back/forward/reload, and AI provider shortcuts.
- A persistent Chromium session partition for user sign-ins and site data.
- Internal, sandboxed provider response capture for ChatGPT, Claude, and DeepSeek.
- Original Response preservation, editable Working Nodes, child nodes, deletion, and explicit model-context selection.
- Insert selected context into the active in-browser provider composer without submitting it automatically.
- Local capture and node persistence.

Not yet implemented:
- The conversation organization, prompt management, advanced browser, export/media, notes, image, GPT Store, sync, community, Showcase, monetization, and Pro capabilities listed above.
- Browser-history/bookmark managers, session restoration UI, folder persistence, and full site-settings UI.
- Manual end-to-end verification against live logged-in provider accounts and the packaged Windows application.

The feature register is the scope reference. The current implementation status is deliberately narrower and must not be confused with the complete product.
