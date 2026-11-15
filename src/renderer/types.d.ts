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
  }

  interface WillAISnapshot { conversations: Conversation[]; }

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
      deleteNode(nodeId: string): Promise<{ok: boolean}>;
      copyText(text: string): Promise<{ok: boolean}>;
      onBrowserState(callback: (state: BrowserState) => void): () => void;
      onCapture(callback: (payload: {created: boolean; conversationId: string; responseId: string}) => void): () => void;
      onSnapshotChanged(callback: () => void): () => void;
      onCaptureError(callback: (result: {provider?: string; error: string}) => void): () => void;
      onContextInsertResult(callback: (result: {ok: boolean; error?: string}) => void): () => void;
    };
  }
}
