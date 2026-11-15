# WillAI-C — Complete Interface Design Specification

**Status:** Proposed interface baseline  
**Scope:** Desktop application UX and visual system  
**Baseline:** Product scope in `docs/PRODUCT_SCOPE.md` and architecture in `docs/ARCHITECTURE.md`  
**Design rule:** The workspace is the product. Chromium is an integrated way to reach provider sessions and web content; it is never the application's default visual center.

---

## 1. Product experience to design for

WillAI-C is a desktop workspace for turning work performed with AI providers into durable, editable, searchable material.

The interface must make five things obvious:

1. The user's workspace and saved material are always available.
2. An AI conversation is a source and an activity stream, not the final destination of all work.
3. An assistant response is preserved in its original form and can also become structured working material.
4. The user controls which working material is sent back to an AI provider.
5. The user can move between the workspace and a signed-in provider session without losing either context.

### What the interface must not become

- A browser window with a narrow application sidebar attached to it.
- A three-column layout that permanently divides the screen between navigation, an editor, and a small browser.
- A generic chat application whose only durable object is a conversation transcript.
- A node editor that flattens a rich response into one unformatted text field.
- A dashboard full of metrics and cards that the user must pass through before reaching their actual work.
- A direct clone of Tana, Superpower GPT, or another product.

The design borrows familiar interaction conventions where useful, but the central workflow is specific to WillAI-C: preserve a response, work with its content, create related material, and control its future use as model context.

---

## 2. Core information model reflected in the UI

The interface is organized around these objects. They must remain distinct in the UI and in storage.

| Object | What it represents | UI treatment |
|---|---|---|
| Workspace | The user's local working environment | Persistent application shell |
| Conversation | A provider-side discussion and its captured history | Library item with messages and source URL |
| Message | A user or assistant turn in a conversation | Timeline item |
| Original Response | The preserved assistant output as received | Read-only, faithfully rendered source |
| Working Document | The editable representation derived from an Original Response | Main editing surface |
| Block / Working Node | A paragraph, heading, list item, code block, quote, table, or other addressable content unit | Inline selectable and editable content |
| Relation | A semantic link between content objects | Link chip and relationship panel |
| AI-generated child | An explanation, refinement, or other result derived from a selected block/node | Child item with provenance |
| Model Context | The explicit projection of selected content sent to a provider | Visible selection state and preview |
| Prompt | Reusable input content | Prompt library and composer picker |
| Note | User-authored material, global or conversation-specific | Notes workspace and inline reference |
| Highlight / Annotation | A reference to a source range with a user comment | Inline mark and navigation item |
| Browser Session / Tab | A signed-in provider or ordinary web page | Managed browser workspace surface |

**Important:** a node's parent-child position does not replace semantic relations. A node can be nested under another node and also link to other nodes, conversations, notes, or sources.

### Original Response and Working Document

An Original Response must never be silently rewritten by editing a Working Document.

- The Original Response preserves its source content and provenance.
- The Working Document begins as a structured, faithful rendering of that response.
- Edits apply to the Working Document, not the source.
- The user can switch between **Original** and **Working** at any time.
- The user can reset a Working Document from its Original Response only through an explicit, confirmable action.
- The two views must share block identities or source anchors where possible so selection, highlights, citations, and provenance remain traceable.

A response must not be represented as one giant plain-text node. It must retain block boundaries and block types.

---

## 3. Application shell

### 3.1 Desktop layout

The shell has four conceptual regions, but only two are permanently visible.

| Region | Default width | Persistent? | Purpose |
|---|---:|---|---|
| Global app rail | 60 px | Yes | Primary destinations and global actions |
| Navigation pane | 248 px | Usually | Contextual lists: conversations, folders, prompts, notes |
| Main work canvas | Flexible | Yes | Current object, document, conversation, or browser session |
| Context panel | 320 px | No | Inspector, outline, references, or AI assistant; opened on demand |

The top application bar is 56 px high. The main canvas must remain the largest surface. The context panel is closed by default except when the user explicitly opens it or a workflow requires a short-lived inspector.

At a 1440 × 900 window size, the normal workspace should be:

- 60 px global rail.
- 248 px navigation pane.
- Remaining width for the main canvas.
- Optional 300–340 px context panel when requested.

The browser must not occupy a permanently reserved third column.

### 3.2 Global rail

Use a narrow icon rail with clear labels on hover and an accessible tooltip. The destinations are:

1. Home
2. Work
3. Prompts
4. Notes
5. Media
6. Browser
7. Settings

The active destination has a restrained background and a clear focus indicator. Do not use emoji as primary navigation icons. Use one consistent icon family.

The rail also provides:
- Global Search / Command Palette.
- Create action.
- User profile and plan status at the bottom, when account features exist.

### 3.3 Navigation pane

The navigation pane changes according to the selected global destination. It is not a second permanent product menu.

Examples:

- **Work:** All conversations, folders, Starred, Pinned messages, Archived, Temporary.
- **Prompts:** All prompts, Favorites, Categories, Queue, Chains, Instruction Profiles.
- **Notes:** All notes, Conversation notes, Global notes, References.
- **Media:** Images, Audio, Downloads, Export history.
- **Browser:** Open tabs, Recent sites, Bookmarks, History.

The pane has a visible collapse control. Its width can be resized between 220 and 360 px and remembered per workspace. Resizing must never be the only way to expose hidden controls.

### 3.4 Top application bar

The top bar contains, from left to right:

- Current destination / breadcrumb.
- Current object title, editable only where appropriate.
- Optional view switcher, such as Conversation / Response Workbench.
- Search and command palette access.
- Context-panel toggle.
- Window-level actions only when necessary.

Do not put every feature in the top bar. Contextual actions belong next to the object they affect.

---

## 4. Primary destinations and screen designs

### 4.1 Home

Home is a useful landing point, not a KPI dashboard.

Content:
- A single prominent **Continue working** area for recently opened documents/conversations.
- Recent conversations and recent working documents as compact rows.
- Quick create actions: New note, New prompt, Open provider session.
- A small status line for browser/provider session and capture health.

Do not make metric cards the primary content. Counts can appear as secondary information, but they must not displace recent work.

Empty state:
- Explain how to open a provider session.
- Show one clear action to open ChatGPT, Claude, or DeepSeek.
- Explain that captured responses become available in Work.
- Never imply capture is working until the adapter reports that it is loaded and has detected a supported response.

### 4.2 Work — conversation library

This is the main entry point for saved AI work.

Layout:
- Navigation pane: folder tree, filters, and saved views.
- Main canvas: conversation list with compact rows.
- Optional context panel: details for the selected conversation or folder.

Conversation row:
- Conversation title.
- Provider and account/session identity when available.
- Last activity timestamp.
- Response count.
- Folder and pinned state.
- Capture health warning only when relevant.
- Context menu for pin, archive, move, export, and delete.

Search and filters:
- Search title and indexed conversation content.
- Filter by provider, folder, date, pinned, archived, temporary, and capture state.
- Sorting by last activity, created date, and title.
- Bulk selection appears only after selection begins.

Folders:
- Support nested folders, drag-and-drop, favorites, color, and optional image.
- Folder operations must have undo or a confirmation for destructive actions.
- The same folder tree must be available from a secondary right-side folder navigator when requested, without depending on the provider's native sidebar.

Do not put the entire conversation library into the narrow global rail.

### 4.3 Conversation view

A conversation is a readable timeline, not a browser screenshot and not a plain text dump.

Layout:
- Main canvas displays user and assistant turns in chronological order.
- A compact conversation header contains title, provider, source link, timestamp, folder, and conversation-level actions.
- The response/message navigator is an optional panel, not an always-visible narrow column.
- The context panel can show Outline, Prompts, References, Highlights, or Assistant.

Message presentation:
- User and assistant turns have clearly distinct but restrained treatments.
- Assistant messages render Markdown and supported rich blocks faithfully.
- Headings, lists, nested lists, code, tables, block quotes, links, images, citations, and other supported content retain their type and hierarchy.
- Long responses can be collapsed without losing their content.
- Timestamps appear on hover or via a display setting; they should not clutter every line.
- Message actions appear on hover, focus, or explicit selection.

Message actions:
- Open in Response Workbench.
- Copy response (Markdown, HTML, or plain text).
- Pin / unpin.
- Highlight selection.
- Add annotation.
- Create a note from selection.
- Export selected message.
- Add message or selected blocks to Model Context.
- Open original provider message when source URL is available.

Navigator filters:
- All messages.
- User messages.
- Assistant messages.
- Prompts.
- Pinned messages.
- Group by day.
- Search within the entire conversation, including unloaded messages where the provider adapter supports it.

### 4.4 Response Workbench — the defining WillAI-C screen

This is the most important screen in the product. It is where an assistant response becomes usable work.

The Workbench must have a clear hierarchy:

**Header**
- Breadcrumb: Work / Conversation / Response.
- Response title or short generated heading.
- Provider, model if known, and captured timestamp.
- Source link.
- Actions: Copy, Export, Pin, More.

**Mode switch**
- Original
- Working
- Context Preview

The default is Working after the first open only if a Working Document exists; otherwise show the faithful Original response first with a clear **Start working with this response** action.

**Main canvas**
- A single readable document column with a comfortable reading width.
- Content blocks preserve their original formatting.
- Blocks have stable identities and can be selected independently.
- No permanent side-by-side source and editor split.
- No card around every paragraph.
- No forced outline indentation for ordinary prose.

**Optional context panel**
- Outline: headings and block navigation.
- Inspector: selected block metadata, provenance, source anchor, and relationships.
- Assistant: Explain, Refine, Summarize, Ask about selection, or create a child artifact.
- References: linked conversations, notes, files, and URLs.
- Model Context: exact selection preview and inclusion state.

The user can switch the context panel between these modes. Do not show separate permanent panels for Outline, AI Assistant, and Inspector.

#### Working with blocks

Selecting text or a block opens a compact contextual toolbar near the selection. It provides:

- Create node from selection.
- Explain.
- Refine.
- Summarize.
- Create note.
- Highlight / annotate.
- Add to Model Context.
- Link to an existing object.

Creating a node from a selection preserves the original block and records a source anchor. It must not destroy or silently move the selected text.

A block can be edited inline. The toolbar and block actions must remain available by keyboard as well as pointer.

#### AI-generated child artifacts

Explain and Refine must create a child artifact under the selected node/block, not replace the parent.

Every generated child records:
- Parent node/block ID.
- Action type (Explain, Refine, Summarize, custom request).
- Provider and model when known.
- Prompt/instruction used.
- Creation time.
- Provenance as AI-generated.
- Whether the user has edited it.
- Model Context inclusion state, off by default.

A child can itself be refined or explained, allowing a traceable tree of work.

#### Node and block behavior

Support:
- Add sibling and child.
- Indent / outdent.
- Reorder by keyboard and drag-and-drop.
- Collapse / expand descendants.
- Split and merge blocks.
- Undo / redo.
- Multi-select blocks.
- Move or link blocks to another document.
- Change block type without losing content.
- Search within the current document.
- Copy a selection with Markdown/HTML fidelity.

The outline is a document organization mode, not the only visual presentation of content. A paragraph remains a paragraph; a table remains a table; code remains code.

### 4.5 Browser workspace

The browser is a first-class capability, but it does not dominate the workspace.

**Default behavior**
- Browser pages do not appear in a permanently visible right-hand dock.
- Opening a provider session switches the main canvas to **Browser Session** mode while preserving the app shell and navigation.
- Browser tab strip and address/navigation controls sit in the canvas header.
- The active page gets the available canvas width and height.
- The workspace remains accessible through the rail and conversation library.

**Browser Session header**
- Back, forward, reload.
- Address/search field.
- Tab strip with provider icon and page title.
- New tab and close-tab controls.
- Session/profile indicator.
- Capture status indicator with a details popover.

**Optional split mode**
- The user can explicitly open a browser split beside a Working Document.
- It starts closed.
- The user can resize it and close it without changing the document.
- At narrower window sizes, split mode becomes a switchable overlay or tab rather than squeezing both surfaces.
- The browser's native WebContentsView bounds must always be constrained to the browser canvas rectangle. It must never cover application navigation or editor controls.

**Capture feedback**
- A small, persistent status indicator shows Adapter loading, Ready, Capturing, Saved, or Error.
- Detailed diagnostics live in a popover/diagnostics view, not a 50 px permanent footer.
- A successful capture links directly to the created conversation and response in Work.
- Capture failure offers Retry and diagnostic details. It must not mark the source response as saved before persistence succeeds.

### 4.6 AI Assistant panel

The Assistant is contextual, not a permanent chat column.

It opens from:
- A selected block's Explain / Refine action.
- A toolbar command.
- A keyboard shortcut.
- A contextual **Ask about this document** action.

It contains:
- Current provider/session selector.
- Selected content and reference chips.
- Prompt editor.
- Saved prompt picker and variables.
- Insert into provider composer action.
- Clear indication of whether the text is merely inserted or actually submitted.

WillAI-C uses the user's signed-in provider website for browser-based integrations. The UI must not imply that an API call or model response has occurred when the operation only inserted text into the provider's composer. Prompt insertion is reviewable and does not automatically submit unless a separate explicit feature is designed and enabled.

### 4.7 Prompts

Prompt Manager should feel like a reusable content library.

Layout:
- Left pane: categories, favorites, profiles, and filters.
- Main pane: prompt list with title, short preview, category, last used, and favorite state.
- Editor: a dedicated main-canvas document, not a tiny form inside a dashboard card.

Prompt editor:
- Title and description.
- Prompt body with Markdown/plain-text mode.
- Variables such as `{{topic}}`, with a preview form.
- Category and tags.
- Favorite state.
- Version history.
- Test/preview with selected values.
- Save, duplicate, export, delete.

Prompt actions:
- Insert into active provider composer.
- Add to queue.
- Add to chain.
- Optimize (when available).
- Copy as text/Markdown.

Prompt Queue:
- A dedicated queue view with drag-and-drop ordering, status, and per-item review.
- Clearly distinguish **Insert next** from **Send automatically**.
- The current release's manual queue must remain manual; the UI must not imply automatic sending.

Prompt Chains:
- A step-based editor with input/output mapping and explicit confirmation at steps that send prompts.
- Execution history and failure recovery.
- Show unsupported steps as unavailable, not as working controls.

Instruction Profiles:
- User-created reusable instruction sets.
- Active profile visible in composer context.
- Automatic appending must be explicitly configurable and inspectable.

Community prompt discovery and public sharing appear only when their backend exists.

### 4.8 Notes and references

Notes is a lightweight knowledge workspace.

Views:
- All Notes.
- Global Notes.
- Conversation Notes.
- Referenced Notes.

Editor:
- A readable document editor with titles, blocks, links, and attachments.
- Backlinks and linked conversations.
- Provenance when content originated from an AI response.
- Search and tags.
- Optional right-side relationship inspector.

Conversation references:
- A reference picker that searches conversations.
- A preview before inclusion.
- Node-level selection of which content is available as model context.
- Explicit privacy indicator for included vs private material.

### 4.9 Search

Global Search is available from the app rail and `Ctrl/Cmd + K`.

Search domains:
- Conversations and messages.
- Original Responses.
- Working Documents and nodes.
- Prompts and prompt history.
- Notes.
- Highlights and annotations.
- Bookmarks and browser history.
- Media metadata.

Results show object type, title, matching excerpt, provider/source, and date. Search terms are highlighted in context. Filters are available without requiring advanced query syntax.

The command palette is separate from full-text search: it offers navigation and actions such as New Note, Open Browser, Create Prompt, Toggle Context Panel, and Switch Theme.

### 4.10 Media

Media is a library rather than a row of utilities.

Sections:
- Images from conversations.
- Audio and transcripts.
- Downloads.
- Export jobs.

Image items show source conversation, message, prompt where available, dimensions, and saved status. Audio items show transcript, duration, voice metadata, and playback state. Features not implemented in the current release should not appear as active controls.

### 4.11 Conversation maps, minimap, highlights, and navigation

These are optional tools available from a conversation's toolbar or context panel.

- Conversation Tree Map: an explicit view for branch exploration, not the default conversation view.
- Minimap: a thin navigation overview for long conversations; it must not compress the message content.
- Highlights: color-coded references anchored to source text, with annotations and a searchable list.
- Message Navigator: a searchable list of prompts, responses, dates, and pinned messages.
- Long-chat loading: visible loading state and clear range information; never silently omit old messages.
- Full-chat Find: results must include messages that are not currently rendered when the provider adapter has access to them.

### 4.12 Settings

Settings are grouped by responsibility:

1. Appearance: theme, density, content width, font size, motion.
2. Workspace: default landing page, navigation pane, context panel, autosave, undo history.
3. Browser: profile, downloads, permissions, tabs, history, session restore.
4. AI Providers: provider adapters, capture diagnostics, supported providers, account/session status.
5. Prompts: default library behavior, variables, history, instruction profiles.
6. Privacy and Model Context: defaults, inclusion behavior, local data, export, deletion.
7. Keyboard: shortcuts and conflicts.
8. Sync: devices, sync status, conflict resolution (when service exists).
9. Plan and Entitlements: plan, feature availability, subscription status (when account service exists).

Use a settings navigation list and one focused settings page at a time. Do not place every setting in one long form.

---

## 5. Key end-to-end workflows

### Workflow A — Start a provider conversation and capture a response

1. User opens Browser from the rail or chooses a provider shortcut.
2. Browser Session takes the main canvas, with the user's persistent signed-in profile.
3. User works on ChatGPT, Claude, DeepSeek, or another supported provider.
4. The internal provider adapter detects a completed assistant response.
5. WillAI-C captures the response and persists it.
6. A small Saved indicator appears, with a direct **Open in Workbench** action.
7. Work shows the conversation and captured response in the library.

No browser page should be hidden behind an unusably narrow panel during normal provider use.

### Workflow B — Turn a response into working material

1. User opens a captured response from Work.
2. Original Response is rendered with the same meaningful formatting and block hierarchy as the provider's copy output.
3. User selects **Start working** or opens Working.
4. WillAI-C creates a structured Working Document from response blocks.
5. User edits blocks, promotes selected text to nodes, reorganizes sections, or adds relations.
6. The immutable Original Response remains available.

### Workflow C — Explain or refine a selected idea

1. User selects a block/node.
2. Contextual toolbar appears.
3. User selects Explain or Refine.
4. The Assistant panel shows the selected source and destination provider.
5. The result is inserted as a child artifact after successful capture.
6. Parent and child remain linked. The parent is not replaced.
7. The new child is private to Model Context until the user includes it.

### Workflow D — Reuse saved context

1. User selects one or more nodes, notes, or referenced conversations.
2. The Model Context panel lists exactly what will be shared.
3. User reviews the generated context preview.
4. User chooses Insert into provider composer.
5. WillAI-C inserts text but does not submit it automatically.
6. Provider identity and destination are visible before insertion.

---

## 6. Visual design system

### 6.1 Visual direction

Use a calm, professional desktop-workspace visual language.

- Neutral graphite/slate surfaces rather than green-tinted panels everywhere.
- One restrained primary accent for selection and primary actions.
- Preserve the existing warm brand accent only for brand identity and rare emphasis.
- Borders separate structure; cards are reserved for distinct objects, not every content region.
- Whitespace and typography create hierarchy before color does.
- Avoid excessive uppercase micro-labels, decorative badges, gradients, and glowing status dots.
- Avoid using a card around each paragraph or node.

### 6.2 Initial dark-theme tokens

These are starting design tokens and should be centralized, not copied into individual component rules.

| Token | Value | Use |
|---|---|---|
| `bg.canvas` | `#11151A` | App background |
| `bg.surface` | `#171D24` | Navigation and panels |
| `bg.elevated` | `#202832` | Menus, dialogs, raised surfaces |
| `bg.hover` | `#252F3A` | Hover state |
| `border.default` | `#303A45` | Standard separators |
| `text.primary` | `#E8EDF2` | Main text |
| `text.secondary` | `#A6B0BC` | Supporting text |
| `text.muted` | `#788491` | Metadata |
| `accent.primary` | `#8FC8A5` | Selection, primary action, focus |
| `accent.brand` | `#D7B08A` | Brand detail only |
| `state.success` | `#7FC69A` | Saved / success |
| `state.warning` | `#E2B36C` | Needs attention |
| `state.danger` | `#D98282` | Destructive/error |
| `state.info` | `#8FB3DC` | Informational state |

Light theme must use the same semantic tokens with a separate palette. Components must not hardcode colors.

### 6.3 Typography

Use Segoe UI Variable on Windows with a reliable system fallback. Keep a consistent scale:

| Role | Size | Weight |
|---|---:|---:|
| Page title | 24–28 px | 600 |
| Section heading | 18–20 px | 600 |
| Panel heading | 15–16 px | 600 |
| Body / interface text | 14 px | 400 |
| Supporting text | 13 px | 400 |
| Metadata | 12 px | 400 |
| Long-form response content | 16 px | 400 |
| Code | 13–14 px | 400 |

No important interface text may use 7–10 px. Small metadata may use 12 px, but must remain readable at normal desktop scaling.

Long-form content uses a comfortable line height of 1.6–1.75 and a maximum reading width of approximately 820–900 px. Tables and code blocks can expand horizontally within the document canvas.

### 6.4 Spacing, controls, and geometry

Use a 4 px base spacing scale: 4, 8, 12, 16, 20, 24, 32, 40.

- Standard input/button height: 36–40 px.
- Compact toolbar button: at least 32 px clickable area.
- List row: 44–56 px depending on metadata.
- Panel padding: 16–20 px.
- Main document top/bottom padding: 28–36 px.
- Standard radius: 6–8 px.
- Dialog radius: 10 px.
- Focus ring: visible, 2 px, using the primary accent.
- Separators should be subtle; avoid nested outlines around every child element.

### 6.5 Density

Provide Comfortable and Compact density settings. Comfortable is the default. Compact may reduce row padding and navigation spacing, but must not reduce text below the typography scale.

### 6.6 Motion

Use short, restrained transitions for:
- Context panel open/close.
- Navigation pane collapse.
- Selection and hover.
- Menus and dialogs.

Respect reduced-motion settings. Do not animate captured content or cause layout jumps while responses stream or save.

---

## 7. Responsive behavior

WillAI-C is desktop-first, but must remain usable at reduced window sizes.

| Available width | Behavior |
|---:|---|
| 1440 px and above | Rail + nav pane + main canvas; optional context panel |
| 1200–1439 px | Same shell; context panel overlays or replaces nav pane when space is constrained |
| 980–1199 px | Rail remains; navigation pane collapses to an overlay; context panel becomes a drawer |
| 860–979 px | Main canvas remains primary; only one auxiliary surface can be open at a time |
| Below 860 px | Not a supported primary desktop target; prevent overlap and preserve access through drawers |

Rules:
- Never solve narrow windows by shrinking all text.
- Browser Session gets priority for page width.
- Split mode is disabled automatically when either side would fall below its minimum useful width.
- Dialogs and command menus must fit within the visible window.
- Focus must return to the originating control after closing overlays.

---

## 8. States and feedback

Every major screen must define these states:

- Loading / skeleton.
- Empty, with one clear next action.
- Normal content.
- Selected object.
- Saving / saved.
- Offline or provider unavailable.
- Permission required.
- Adapter not loaded.
- Adapter loaded but no supported messages found.
- Capture in progress.
- Capture failed with Retry and details.
- Read-only source.
- Unsaved changes, if autosave is unavailable.
- Conflict, if concurrent edits or sync are introduced.
- Feature unavailable in the current release or plan.

State labels must describe what actually happened. In particular:
- Adapter loaded does not mean capture succeeded.
- Detected does not mean persisted.
- Inserted into composer does not mean submitted.
- A locally saved item does not mean synchronized.
- A visible control must not be presented as available if its backend or implementation does not exist.

---

## 9. Keyboard and pointer behavior

Global:
- `Ctrl/Cmd + K`: Global Search / Command Palette.
- `Ctrl/Cmd + Shift + P`: command palette.
- `Ctrl/Cmd + N`: New item, with a chooser if the current context is ambiguous.
- `Ctrl/Cmd + ,`: Settings.
- `Ctrl/Cmd + B`: Toggle navigation pane.
- `Ctrl/Cmd + \\ `: Toggle context panel (final shortcut to be validated against OS conflicts).
- `Esc`: close topmost menu, popover, or drawer before leaving the current page.

Workbench:
- `Ctrl/Cmd + Z`, `Ctrl/Cmd + Shift + Z`: Undo / redo.
- `Ctrl/Cmd + F`: Find in current document/conversation.
- `Ctrl/Cmd + Shift + C`: Copy selected block/content using the configured copy format.
- Keyboard navigation between blocks and clear focus indication.
- Enter, Tab, and arrow behavior must depend on the current editor mode and must not hijack normal text-editing behavior unexpectedly.

Pointer:
- Drag-and-drop is supported for folder organization, block ordering, and file import where appropriate.
- Hover reveals contextual actions, but every action also remains reachable by keyboard or a menu.
- Destructive actions are not triggered by a single ambiguous icon click without a tooltip/accessible name and undo or confirmation.

---

## 10. Product-scope coverage

The interface architecture must provide a home for every feature in `docs/PRODUCT_SCOPE.md`, but future features must not be shown as working UI before implementation.

| Product area | Designed destination / surface |
|---|---|
| Browser tabs, history, downloads, permissions | Browser workspace and Browser Settings |
| Folders, subfolders, favorites, bulk actions, retention | Work navigation pane and conversation library |
| Conversation tree map, minimap, message filters, timestamps, highlights | Conversation view and optional context tools |
| Global search | Global Search |
| Prompt Manager, variables, optimizer, history, favorites | Prompts |
| Queue and chains | Prompts subviews |
| Custom instructions and profiles | Prompt Settings / Assistant context |
| Language, tone, model, copy and composer controls | Assistant / provider interaction controls |
| Original Responses and Working Nodes | Response Workbench |
| Explain, Refine, provenance, Model Context | Workbench and Assistant panel |
| Chat and global notes, conversation references | Notes |
| PDF, TXT, JSON, Markdown, HTML export and printing | Object actions and Export history |
| Audio, transcripts, voice, text-to-speech | Media and conversation message controls |
| Image Gallery and conversation images | Media |
| Custom GPT discovery | Discover destination, only when supported |
| Showcase, community prompts, paid recipes, sharing | Discover / account surfaces, only after backend implementation |
| Sync and devices | Settings, only after sync exists |
| Pro entitlements | Account and plan settings with centralized entitlement checks |

The initial navigation may hide entire future destinations until their capabilities exist. Do not place disabled placeholder links in the primary navigation simply to advertise the roadmap.

---

## 11. Required component system

Implement these reusable components before building individual feature pages:

1. AppShell, GlobalRail, ContextualNavPane, MainCanvas, ContextPanel.
2. PageHeader, Breadcrumbs, ViewSwitcher, CommandPalette, GlobalSearch.
3. ObjectList, ConversationRow, FolderTree, FilterBar, BulkActionBar.
4. ConversationTimeline, MessageBlock, ResponseHeader, MessageActions.
5. RichContentRenderer, ContentBlock, BlockToolbar, BlockEditor, BlockOutline.
6. OriginalWorkingSwitcher, ModelContextSelector, ContextPreview.
7. AssistantPanel, ProviderPicker, PromptComposer, PromptPicker.
8. BrowserSessionHeader, BrowserTabStrip, BrowserViewport, CaptureStatus.
9. PromptList, PromptEditor, VariableForm, QueueList, ChainEditor.
10. NoteEditor, RelationPicker, ReferenceList, HighlightMarker, AnnotationPanel.
11. SettingsLayout, SettingGroup, Toggle, Select, ShortcutEditor.
12. Dialog, Popover, Tooltip, Toast, EmptyState, LoadingState, ErrorState.

Components must consume semantic design tokens. Do not create feature-specific copies of the same button, list row, panel, or editor style.

---

## 12. Technical constraints for implementation

These are UI requirements that affect the current architecture:

- React owns the application shell and all workspace content.
- Electron's native WebContentsView remains the browser page surface.
- The main process owns WebContentsView creation, navigation, session, permissions, and exact viewport bounds.
- Browser view bounds are derived from a single explicit BrowserViewport rectangle reported by the renderer.
- Browser view must be hidden or resized to zero when its canvas is closed or not active.
- Provider page code remains isolated and untrusted. It must not receive app Node/Electron privileges.
- Provider capture must persist structured response content and report the persistence result to the workspace.
- Renderer UI must not directly depend on the current JSON store shape.
- Original Response and Working Document are separate records with stable references.
- Use a structured content representation for block types; do not use raw `contentEditable` HTML as the persisted source of truth.
- Editing must support undo/redo and must not silently discard unsupported block types.
- Search, highlights, relations, and node selection depend on stable block IDs and source anchors.
- The current JSON persistence may remain a temporary implementation for the first visual prototype, but SQLite and migrations are required before expanding the local object graph and global search.
- UI state (panel visibility, view preferences, density, theme) is separate from user content data.

### Important content fidelity requirement

The captured response must be compared with the provider's actual **Copy** output for supported content types. The acceptance target is not “some readable text was captured”; it is faithful preservation of the response's meaningful content and structure.

Minimum supported block types:
- Paragraph.
- Heading levels.
- Ordered and unordered list, including nesting.
- Code block with language when available.
- Inline code.
- Block quote.
- Table.
- Link.
- Image with source metadata.
- Citation/source link where available.
- Horizontal divider.

Unsupported interactive media or provider-specific widgets must be represented with a clear, source-linked fallback rather than silently omitted.

---

## 13. Acceptance criteria

The design is ready for implementation when all of the following are true:

### Workspace structure
- The application opens into Home or the user's last workspace location, not automatically into a narrow provider browser.
- The global rail, contextual navigation, main canvas, and optional context panel have consistent behavior across all primary destinations.
- No permanent browser column reduces the work canvas.

### Conversation and response
- A conversation can be read without opening the provider page.
- The Original Response is preserved and rendered with correct block structure.
- A Working Document can be edited independently of the Original Response.
- A selection can be promoted to a node without deleting or mangling its source content.
- Explain and Refine create traceable child artifacts.
- Model Context is explicit, previewable, private by default, and never silently submitted.

### Browser
- ChatGPT, Claude, DeepSeek, and ordinary websites open in the integrated browser.
- Existing provider login sessions are preserved by the browser profile.
- Browser Session is usable at the full main-canvas width.
- Optional split mode never overlaps app controls.
- A captured response links directly to its stored workspace object.
- Capture status distinguishes detection from successful persistence.

### Visual quality
- No important text is below 12 px.
- Default body text is 14 px and long-form content is 16 px.
- Spacing, color, radius, and typography come from shared tokens.
- The same component has the same visual and interaction behavior across destinations.
- Keyboard focus is visible, and every pointer action has a keyboard-accessible path.

### Scope honesty
- Implemented features appear as functional controls.
- Planned features remain hidden or clearly marked as unavailable.
- Pro access is enforced by a centralized entitlement source, not just by hiding buttons.

---

## 14. Implementation sequence

This document defines the target experience. It does not authorize implementing every product-scope feature at once.

**Design foundation**
- Establish the semantic token system and typography.
- Build AppShell, GlobalRail, contextual navigation, MainCanvas, and ContextPanel.
- Remove the permanent browser dock from the default layout.
- Add Browser Session as a full-canvas workspace mode.

**Response Workbench**
- Implement Original / Working / Context Preview.
- Build the rich-content renderer and structured block model.
- Preserve source anchors and provenance.
- Add block selection and contextual actions.
- Add child artifacts for Explain and Refine.
- Add undo/redo before advanced editing operations.

**Core workspace**
- Rebuild conversation library and folder navigation using the shell.
- Add conversation timeline and message navigation.
- Add Notes and References.
- Add Global Search after object IDs and indexes are stable.

**Product modules**
- Rebuild Prompt Manager, Queue, Chains, and Profiles.
- Add export history, media, highlights, maps, and minimap.
- Add sync, community, Showcase, account, and Pro screens only with their required services.

Do not continue polishing the current three-column layout as the foundation. Use this specification to establish the new shell and Workbench, while preserving the browser engine, provider adapters, local data, and IPC boundaries that already satisfy the architecture.

---

## 15. Design review checklist

Before an implementation PR is opened, review screenshots and interactions at:
- 1440 × 900: full desktop workspace.
- 1280 × 800: navigation and canvas with context panel.
- 1024 × 768: navigation drawer and full-canvas provider session.
- 900 × 700: minimum desktop layout, no overlapping WebContentsView.

Required review screens:
1. Home with realistic recent work.
2. Conversation library with nested folders and filters.
3. Conversation timeline containing formatted assistant content.
4. Response Workbench in Original mode.
5. Response Workbench in Working mode with block selection and child artifact.
6. Context panel showing exact Model Context selection.
7. Full-canvas Browser Session with several tabs and visible capture status.
8. Prompt Manager and prompt editor.
9. Notes and reference picker.
10. Global Search results.

A screen is not approved because it compiles. It must be reviewed at realistic content density, at the target window size, with keyboard, pointer, loading, empty, and error states.

---

## 16. Design direction update — 15 November 2026

This update reflects the approved direction for the next prototype revision. It supersedes earlier statements in this document wherever they conflict with the following requirements. The earlier Anylife AI dashboard image is a visual reference only; Anylife AI was a prior personal design, not an existing product or a source of WillAI-C feature names.

### 16.1 Default entry point: New Conversation

The main WillAI-C window opens directly to **New Conversation**. This is the primary entry point, not a dashboard that the user must pass through first. Home remains available as a secondary workspace overview.

The New Conversation canvas contains:
- A large, central prompt composer.
- A visible provider/model selector.
- Relevant composer controls such as attachments, web search, and tools, shown as available only when implemented.
- A clear send action.
- A compact indication of the selected provider session and connection state.

The composer must not require the user to open the provider website first. Selecting a provider chooses the signed-in provider account/session that WillAI-C will use for the request.

### 16.2 Intended request and response flow

The target interaction is:

1. The user writes a request in the WillAI-C New Conversation composer.
2. The user selects a supported provider/model.
3. WillAI-C routes the request to the selected provider using the corresponding signed-in account/session through the integrated browser infrastructure, without switching the main workspace to the provider page.
4. WillAI-C detects the completed provider response, captures its content, and persists it with source and provider metadata.
5. The response appears inside the same WillAI-C conversation as one or more structured, addressable response nodes.
6. The user continues working with those nodes in the conversation and Response Workbench.

The provider website remains an execution surface in the background, not the main visual interface. The Browser workspace remains available when the user explicitly needs to inspect or interact with the provider page.

This describes the intended product behavior, not a claim that the HTML prototype performs provider authentication, request routing, response capture, or persistence. The prototype must label simulated states honestly.

### 16.3 Dedicated Conversations Tree canvas

Add **Conversations Tree** as a separate first-class workspace destination. It is a navigable canvas for the message graph of a conversation, not a replacement for the readable conversation timeline.

The canvas should:
- Represent individual user and assistant messages as selectable nodes.
- Connect messages along the current conversation path.
- Display alternate conversation paths as separate branches.
- Provide a **Branch in new chat** action on an eligible message node.
- Create an alternate path from the selected message without modifying the original path.
- Support pan/scroll and zoom controls, including a fit/reset action.
- Distinguish the current path from alternate paths visually. Use a warm yellow marker for the current path and a quieter neutral treatment for alternate paths, consistent with the supplied tree reference.

When a provider supports a native branching action such as ChatGPT's “Branch in new chat,” WillAI-C should preserve the source message identity and provider conversation/branch identifiers so the canvas can represent the resulting relationship. The HTML prototype may simulate branch creation locally; production behavior requires provider-specific integration and stable conversation/message IDs.

A conversation with no branches should display a single linear path. Do not invent alternate branches in the normal initial state.

### 16.4 Preserve the other workspaces

The change to New Conversation as the entry point does not remove or replace the existing Home, Work/library, conversation timeline, Response Workbench, Browser, Prompts, Notes, Media, search, or optional context inspector. They remain separate workspaces in the existing shell. Update their colors and shared visual tokens, but do not force their content or terminology to match the earlier Anylife AI mockup.

### 16.5 Updated visual direction

Use a deep navy/blue-black foundation with dark blue elevated panels. Use blue and violet as the main interface accents, with cyan as a restrained supporting accent. Gradients may be used for the brand mark, primary action, and New Conversation hero treatment; they should not be applied indiscriminately to every panel. Keep text contrast high and preserve readable typography and spacing. Use warm yellow sparingly for the current tree path and selected-node indicator.

The supplied Anylife AI image informs the palette, contrast, and visual rhythm only. Do not copy its labels, navigation taxonomy, feature names, or implied product structure.

### 16.6 Updated navigation and acceptance criteria

The global rail includes a direct **New Conversation** action and a dedicated **Conversations Tree** destination, alongside the existing workspaces. Home remains available but is no longer the default startup view.

Acceptance criteria for this direction:
- A fresh prototype launch opens New Conversation.
- The user can choose a provider, enter a prompt, and see the intended in-app response destination without opening the Browser workspace.
- The prototype clearly identifies the result as simulated and confirms that no real provider request was sent.
- A newly submitted mock conversation seeds its own linear tree path.
- Branch in new chat adds a distinct alternate path from the selected message while leaving the current path intact.
- The original Home, Work, Conversation, Response Workbench, Browser, Prompts, Notes, Media, and Model Context experiences remain reachable.
- No production Electron/provider integration is implied by the prototype.
