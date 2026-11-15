export {};

declare global {
  type Provider = 'chatgpt' | 'claude' | 'deepseek';
  type CaptureAdapterState = 'waiting' | 'ready' | 'scanning' | 'no-message-elements' | 'message-elements-found' | 'response-sent' | 'capture-error';

  interface ProviderCaptureStatus {
    provider: Provider;
    state: CaptureAdapterState;
    candidateCount: number;
    capturedCount: number;
    message?: string;
    updatedAt: string;
  }

  interface WorkingNode {
    id: string;
    parentId: string | null;
    content: string;
    initialContent: string;
    position: number;
    sequence?: number;
    nodeType?: 'paragraph' | 'heading' | 'list-item' | 'blockquote' | 'code' | 'table' | 'divider' | 'html' | string;
    headingLevel?: number | null;
    listOrdered?: boolean;
    listStart?: number;
    listIndex?: number;
    provenance: 'captured' | 'human-edited' | 'human-created' | string;
    includeInModelContext: boolean;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
  }

  interface OriginalResponse {
    id: string;
    sourceMessageId: string | null;
    originalContent: string;
    pinned?: boolean;
    contentFormat?: 'markdown' | string;
    capturedAt: string;
    nodes: WorkingNode[];
  }

  interface Conversation {
    id: string;
    provider: Provider;
    title: string;
    sourceUrl: string;
    createdAt: string;
    updatedAt: string;
    responses: OriginalResponse[];
    sharedContextPreview: string;
    folderId?: string | null;
    pinned?: boolean;
    archivedAt?: string | null;
    temporary?: boolean;
    referenceConversationIds?: string[];
  }

  interface WorkspaceFolder {
    id: string;
    name: string;
    parentId: string | null;
    color: string;
    icon: string;
    position: number;
  }

  interface WorkspacePrompt {
    id: string;
    title: string;
    content: string;
    category: string;
    tags: string[];
    kind: 'prompt' | 'chain';
    steps: string[];
    favorite: boolean;
    usageCount: number;
    createdAt: string;
    updatedAt: string;
  }

  interface PromptHistoryItem {
    id: string;
    promptId: string | null;
    promptTitle: string;
    content: string;
    provider?: string | null;
    usedAt: string;
  }

  interface WorkspaceNote {
    id: string;
    title: string;
    content: string;
    conversationId: string | null;
    pinned: boolean;
    createdAt: string;
    updatedAt: string;
  }

  interface WorkspaceBookmark {
    id: string;
    name: string;
    url: string;
    createdAt: string;
  }

  interface WorkspaceSearchResult {
    id: string;
    kind: 'Conversation' | 'Original Response' | 'Working Node' | 'Prompt' | 'Prompt History' | 'Note' | 'Bookmark' | 'Browser History';
    title: string;
    subtitle: string;
    excerpt: string;
    conversationId?: string;
    url?: string;
  }

  interface BrowserHistoryItem {
    id: string;
    url: string;
    title: string;
    visitedAt: string;
  }

  interface PromptQueueItem {
    id: string;
    title: string;
    content: string;
    position: number;
    createdAt: string;
  }

  interface WorkspaceSettings {
    autoArchiveDays: number;
    autoDeleteDays: number;
  }

  interface WillAISnapshot {
    conversations: Conversation[];
    folders: WorkspaceFolder[];
    prompts: WorkspacePrompt[];
    promptHistory: PromptHistoryItem[];
    notes: WorkspaceNote[];
    bookmarks: WorkspaceBookmark[];
    browserHistory: BrowserHistoryItem[];
    promptQueue: PromptQueueItem[];
    settings: WorkspaceSettings;
  }

  interface BrowserTab {
    id: string;
    title: string;
    url: string;
    isLoading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    favicon: string;
    provider: Provider | null;
    captureStatus: ProviderCaptureStatus | null;
  }

  interface BrowserState {
    tabs: BrowserTab[];
    activeTabId: string | null;
  }

  interface Window {
    willai: {
      getSnapshot(): Promise<WillAISnapshot>;
      searchWorkspace(query: string, limit?: number): Promise<WorkspaceSearchResult[]>;
      getBrowserState(): Promise<BrowserState>;
      createTab(url?: string): Promise<string>;
      activateTab(tabId: string): Promise<BrowserState>;
      closeTab(tabId: string): Promise<BrowserState>;
      navigate(value: string): Promise<void>;
      goBack(): Promise<void>;
      goForward(): Promise<void>;
      reload(): Promise<void>;
      setBrowserBounds(bounds: { x: number; y: number; width: number; height: number }): Promise<void>;
      insertContext(conversationId: string): Promise<{ok: boolean; error?: string}>;
      updateNode(nodeId: string, content: string): Promise<{ok: boolean}>;
      setNodeContext(nodeId: string, enabled: boolean): Promise<{ok: boolean}>;
      createChildNode(responseId: string, parentId: string | null): Promise<{nodeId: string}>;
      createSiblingNode(nodeId: string, content?: string): Promise<{nodeId: string}>;
      moveNode(nodeId: string, direction: 'indent' | 'outdent' | 'up' | 'down'): Promise<{ok: boolean; parentId?: string | null}>;
      deleteNode(nodeId: string): Promise<{ok: boolean}>;
      setResponsePinned(responseId: string, pinned: boolean): Promise<{ok: boolean}>;
      createFolder(input: {name: string; parentId?: string | null; color?: string; icon?: string}): Promise<{folderId: string}>;
      updateFolder(folderId: string, patch: {name?: string; color?: string; icon?: string}): Promise<{ok: boolean}>;
      deleteFolder(folderId: string): Promise<{ok: boolean}>;
      moveConversation(conversationId: string, folderId: string | null): Promise<{ok: boolean}>;
      setConversationFlags(conversationId: string, patch: {pinned?: boolean; archived?: boolean; temporary?: boolean}): Promise<{ok: boolean}>;
      bulkDeleteConversations(ids: string[]): Promise<{deleted: number}>;
      savePrompt(input: Partial<WorkspacePrompt> & {title: string; content: string}): Promise<{promptId: string}>;
      deletePrompt(promptId: string): Promise<{ok: boolean}>;
      setPromptFavorite(promptId: string, favorite: boolean): Promise<{ok: boolean}>;
      expandPrompt(promptId: string, variables: Record<string, string>): Promise<{content: string; variables: string[]}>;
      recordPromptHistory(content: string, provider?: string | null): Promise<{ok: boolean}>;
      enqueuePrompt(content: string, title?: string): Promise<{itemId: string}>;
      removePromptQueueItem(itemId: string): Promise<{ok: boolean}>;
      insertPrompt(content: string): Promise<{ok: boolean; error?: string}>;
      saveNote(input: {id?: string; title?: string; content: string; conversationId?: string | null; pinned?: boolean}): Promise<{noteId: string}>;
      deleteNote(noteId: string): Promise<{ok: boolean}>;
      setConversationReferences(conversationId: string, references: string[]): Promise<{ok: boolean}>;
      addBookmark(input: {name?: string; url: string}): Promise<{bookmarkId: string; created: boolean}>;
      deleteBookmark(bookmarkId: string): Promise<{ok: boolean}>;
      updateWorkspaceSettings(patch: Partial<WorkspaceSettings>): Promise<{ok: boolean}>;
      exportConversation(conversationId: string, format: 'txt' | 'markdown' | 'html' | 'json' | 'pdf', responseIds?: string[] | null): Promise<{canceled: boolean; filePath?: string}>;
      exportPrompts(): Promise<{canceled: boolean; filePath?: string}>;
      importPrompts(): Promise<{canceled: boolean; imported: number}>;
      copyText(text: string): Promise<{ok: boolean}>;
      onBrowserState(callback: (state: BrowserState) => void): () => void;
      onCapture(callback: (payload: {created: boolean; conversationId: string; responseId: string}) => void): () => void;
      onSnapshotChanged(callback: () => void): () => void;
      onCaptureError(callback: (result: {provider?: string; error: string}) => void): () => void;
      onContextInsertResult(callback: (result: {ok: boolean; error?: string}) => void): () => void;
    };
  }
}
