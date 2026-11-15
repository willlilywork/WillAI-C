export {};
declare global {
  type Provider = 'chatgpt' | 'claude' | 'deepseek';
  interface WorkingNode {
    id: string; parentId: string | null; content: string; initialContent: string;
    position: number; provenance: 'captured' | 'human-edited' | 'human-created' | string;
    includeInModelContext: boolean; createdAt: string; updatedAt: string; deletedAt: string | null;
  }
  interface OriginalResponse {
    id: string; sourceMessageId: string | null; originalContent: string; capturedAt: string; nodes: WorkingNode[];
  }
  interface Conversation {
    id: string; provider: Provider; title: string; sourceUrl: string; createdAt: string; updatedAt: string;
    responses: OriginalResponse[]; sharedContextPreview: string;
  }
  interface WillAISnapshot { conversations: Conversation[]; }
  interface BridgeInfo { host: string; port: number; token: string; running: boolean; }
  interface Window {
    willai: {
      getSnapshot(): Promise<WillAISnapshot>; getBridgeInfo(): Promise<BridgeInfo>;
      copyText(text: string): Promise<{ok: boolean}>; openSourceUrl(url: string): Promise<{ok: boolean}>;
      updateNode(nodeId: string, content: string): Promise<{ok: boolean}>;
      setNodeContext(nodeId: string, enabled: boolean): Promise<{ok: boolean}>;
      createChildNode(responseId: string, parentId: string | null): Promise<{nodeId: string}>;
      deleteNode(nodeId: string): Promise<{ok: boolean}>;
      onCapture(callback: (payload: {conversationId: string; responseId: string}) => void): () => void;
    };
  }
}
