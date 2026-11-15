import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const providerLabels: Record<Provider, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  deepseek: 'DeepSeek',
};

const providerUrls: Record<Provider, string> = {
  chatgpt: 'https://chatgpt.com/',
  claude: 'https://claude.ai/new',
  deepseek: 'https://chat.deepseek.com/',
};

function sourceKey(value: string) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.replace(/\/$/, '');
  } catch {
    return value;
  }
}

function App() {
  const [browserState, setBrowserState] = useState<BrowserState>({ tabs: [], activeTabId: null });
  const [snapshot, setSnapshot] = useState<WillAISnapshot>({ conversations: [] });
  const [address, setAddress] = useState('');
  const [showWorkPanel, setShowWorkPanel] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const hostRef = useRef<HTMLDivElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);

  const activeTab = useMemo(
    () => browserState.tabs.find((tab) => tab.id === browserState.activeTabId) ?? null,
    [browserState],
  );

  const activeConversation = useMemo(
    () => snapshot.conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [snapshot.conversations, activeConversationId],
  );

  const refreshSnapshot = useCallback(async () => {
    const next = await window.willai.getSnapshot();
    setSnapshot(next);
    setActiveConversationId((current) => {
      if (current && next.conversations.some((item) => item.id === current)) return current;
      return next.conversations[0]?.id ?? null;
    });
  }, []);

  const updateBounds = useCallback(() => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return;
    void window.willai.setBrowserBounds({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    });
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([window.willai.getBrowserState(), window.willai.getSnapshot()])
      .then(([nextBrowser, nextSnapshot]) => {
        if (!alive) return;
        setBrowserState(nextBrowser);
        setSnapshot(nextSnapshot);
        setActiveConversationId(nextSnapshot.conversations[0]?.id ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (alive) {
          setNotice('WillAI-C could not initialise the browser workspace.');
          setLoading(false);
        }
      });

    const offBrowser = window.willai.onBrowserState((state) => {
      setBrowserState(state);
    });
    const offCapture = window.willai.onCapture((result) => {
      setActiveConversationId(result.conversationId);
      setShowWorkPanel(true);
      setNotice('A new response was captured into this workspace.');
      refreshSnapshot().catch(() => setNotice('The response was captured, but the workspace did not refresh.'));
    });
    const offSnapshot = window.willai.onSnapshotChanged(() => {
      refreshSnapshot().catch(() => {});
    });
    const offInsert = window.willai.onContextInsertResult((result) => {
      setNotice(result.ok ? 'Shared context inserted into the prompt composer. Review it before sending.' : result.error || 'Could not insert shared context.');
    });

    return () => {
      alive = false;
      offBrowser();
      offCapture();
      offSnapshot();
      offInsert();
    };
  }, [refreshSnapshot]);

  useEffect(() => {
    if (activeTab) setAddress(activeTab.url);
  }, [activeTab?.id, activeTab?.url]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(updateBounds);
    observer.observe(host);
    window.addEventListener('resize', updateBounds);
    updateBounds();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateBounds);
      void window.willai.setBrowserBounds({ x: 0, y: 0, width: 0, height: 0 });
    };
  }, [updateBounds, showWorkPanel, loading]);

  async function navigate(value = address) {
    try {
      await window.willai.navigate(value);
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not navigate to this address.');
    }
  }

  async function openProvider(provider: Provider) {
    const existing = browserState.tabs.find((tab) => {
      try { return new URL(tab.url).hostname.includes(provider === 'chatgpt' ? 'chatgpt' : provider === 'claude' ? 'claude' : 'deepseek'); }
      catch { return false; }
    });
    if (existing) await window.willai.activateTab(existing.id);
    else await window.willai.createTab(providerUrls[provider]);
  }

  function openConversation(conversation: Conversation) {
    setActiveConversationId(conversation.id);
    setShowWorkPanel(true);
    void navigate(conversation.sourceUrl);
  }

  async function insertContext() {
    if (!activeConversation) return;
    const result = await window.willai.insertContext(activeConversation.id);
    if (!result.ok) setNotice(result.error || 'Could not insert shared context.');
  }

  const responseCount = snapshot.conversations.reduce((total, item) => total + item.responses.length, 0);

  return (
    <div className="browser-app">
      <div className="tab-strip">
        <div className="tab-brand">
          <span className="brand-mark">W</span>
          <span className="brand-word">WillAI<span>-C</span></span>
        </div>
        <div className="tabs">
          {browserState.tabs.map((tab) => (
            <div className={`browser-tab ${tab.id === browserState.activeTabId ? 'active' : ''}`} key={tab.id}>
              <button className="tab-select" type="button" onClick={() => window.willai.activateTab(tab.id)} title={tab.url}>
                {tab.isLoading ? <span className="loading-mark" /> : <span className={`provider-icon ${tab.provider || 'web'}`}>{tab.provider === 'chatgpt' ? '✳' : tab.provider === 'claude' ? '✴' : tab.provider === 'deepseek' ? '◈' : '●'}</span>}
                <span className="tab-title">{tab.title || 'New tab'}</span>
              </button>
              <button className="tab-close" type="button" aria-label="Close tab" onClick={() => window.willai.closeTab(tab.id)}>×</button>
            </div>
          ))}
        </div>
        <button className="new-tab-button" type="button" title="New tab" onClick={() => window.willai.createTab('https://chatgpt.com/')}>＋</button>
        <div className="window-space">CHROMIUM · LOCAL PROFILE</div>
      </div>

      <div className="navigation-bar">
        <div className="navigation-buttons">
          <button type="button" title="Back" disabled={!activeTab?.canGoBack} onClick={() => window.willai.goBack()}>←</button>
          <button type="button" title="Forward" disabled={!activeTab?.canGoForward} onClick={() => window.willai.goForward()}>→</button>
          <button type="button" title="Reload" onClick={() => window.willai.reload()}>{activeTab?.isLoading ? '×' : '↻'}</button>
          <button type="button" title="Open ChatGPT" onClick={() => openProvider('chatgpt')}>⌂</button>
        </div>
        <form className="address-form" onSubmit={(event) => { event.preventDefault(); void navigate(); }}>
          <span className="address-security">◈</span>
          <input
            ref={addressRef}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Search or enter an address"
            spellCheck={false}
            aria-label="Search or enter an address"
          />
          <button className="address-go" type="submit">Go</button>
        </form>
        <div className="browser-actions">
          <button type="button" className={showWorkPanel ? 'selected' : ''} onClick={() => setShowWorkPanel((value) => !value)} title="Toggle WillAI workspace">◫ <span>WillAI</span></button>
          <button type="button" title="Focus address bar" onClick={() => addressRef.current?.focus()}>⌕</button>
        </div>
      </div>

      {notice && <button className="notice" type="button" onClick={() => setNotice('')}>{notice}<span>×</span></button>}

      <div className={`browser-body ${showWorkPanel ? 'with-work-panel' : ''}`}>
        <aside className="browser-sidebar">
          <div className="sidebar-group">
            <div className="sidebar-label">AI WORKSPACES</div>
            <button type="button" className="site-link" onClick={() => openProvider('chatgpt')}><span className="provider-icon chatgpt">✳</span>ChatGPT</button>
            <button type="button" className="site-link" onClick={() => openProvider('claude')}><span className="provider-icon claude">✴</span>Claude</button>
            <button type="button" className="site-link" onClick={() => openProvider('deepseek')}><span className="provider-icon deepseek">◈</span>DeepSeek</button>
          </div>

          <div className="sidebar-divider" />
          <div className="sidebar-group conversation-group">
            <div className="sidebar-label">
              <span>CAPTURED CONVERSATIONS</span><span className="sidebar-count">{snapshot.conversations.length}</span>
            </div>
            <div className="conversation-list">
              {snapshot.conversations.map((conversation) => (
                <button
                  type="button"
                  key={conversation.id}
                  className={`conversation-link ${activeConversationId === conversation.id ? 'active' : ''}`}
                  onClick={() => openConversation(conversation)}
                  title={conversation.title}
                >
                  <span className={`provider-dot ${conversation.provider}`} />
                  <span className="conversation-link-text">{conversation.title}</span>
                </button>
              ))}
              {!snapshot.conversations.length && <div className="empty-sidebar">Captured AI responses will appear here.</div>}
            </div>
          </div>

          <div className="sidebar-footer">
            <div><span className="status-dot" /> Browser profile active</div>
            <small>History and sign-ins stay on this device.</small>
          </div>
        </aside>

        <main className="browser-stage">
          <div className="webview-host" ref={hostRef} />
          {loading && <div className="browser-loading">Starting Chromium browser…</div>}
        </main>

        {showWorkPanel && (
          <aside className="work-panel">
            <div className="work-panel-header">
              <div><div className="eyebrow">WILLAI WORKSPACE</div><h2>Response nodes</h2></div>
              <button type="button" className="panel-close" onClick={() => setShowWorkPanel(false)}>×</button>
            </div>
            {activeConversation ? (
              <ConversationWorkbench conversation={activeConversation} onRefresh={refreshSnapshot} onInsertContext={insertContext} />
            ) : (
              <div className="panel-empty">
                <div className="panel-empty-symbol">◈</div>
                <strong>No captured conversation selected</strong>
                <span>Open an AI conversation in this browser and send or receive a response. WillAI-C will capture assistant output here.</span>
                <small>{responseCount} responses captured across {snapshot.conversations.length} conversations</small>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function ConversationWorkbench({
  conversation,
  onRefresh,
  onInsertContext,
}: {
  conversation: Conversation;
  onRefresh: () => Promise<void>;
  onInsertContext: () => Promise<void>;
}) {
  const [selectedResponseId, setSelectedResponseId] = useState(conversation.responses.at(-1)?.id ?? null);

  useEffect(() => {
    setSelectedResponseId(conversation.responses.at(-1)?.id ?? null);
  }, [conversation.id, conversation.responses.length]);

  const response = conversation.responses.find((item) => item.id === selectedResponseId) ?? conversation.responses.at(-1) ?? null;

  async function addNode(responseId: string, parentId: string | null) {
    await window.willai.createChildNode(responseId, parentId);
    await onRefresh();
  }

  async function saveNode(nodeId: string, content: string) {
    await window.willai.updateNode(nodeId, content);
    await onRefresh();
  }

  async function setShared(nodeId: string, enabled: boolean) {
    await window.willai.setNodeContext(nodeId, enabled);
    await onRefresh();
  }

  async function deleteNode(nodeId: string) {
    if (!window.confirm('Delete this node and all of its descendants?')) return;
    await window.willai.deleteNode(nodeId);
    await onRefresh();
  }

  const sharedCount = conversation.responses.flatMap((item) => item.nodes).filter((node) => node.includeInModelContext && !node.deletedAt).length;

  return (
    <div className="workbench-content">
      <div className="conversation-summary">
        <span className={`provider-icon ${conversation.provider}`}>{conversation.provider === 'chatgpt' ? '✳' : conversation.provider === 'claude' ? '✴' : '◈'}</span>
        <div><strong>{conversation.title}</strong><small>{providerLabels[conversation.provider]} · {conversation.responses.length} captured responses</small></div>
      </div>
      <div className="workbench-actions">
        <button type="button" className="insert-context-button" disabled={!conversation.sharedContextPreview} onClick={() => void onInsertContext()}>Insert shared context into prompt</button>
        <div className="shared-status">{sharedCount} shared nodes · others remain private</div>
      </div>
      <div className="response-selector">
        <div className="sidebar-label">ORIGINAL RESPONSES</div>
        {conversation.responses.map((item, index) => (
          <button key={item.id} type="button" className={`response-select ${response?.id === item.id ? 'active' : ''}`} onClick={() => setSelectedResponseId(item.id)}>
            <span>Response {String(index + 1).padStart(2, '0')}</span><small>{new Date(item.capturedAt).toLocaleTimeString()}</small>
          </button>
        ))}
      </div>
      {response && (
        <>
          <details className="original-response">
            <summary>View original response <span>read-only</span></summary>
            <pre>{response.originalContent}</pre>
          </details>
          <div className="node-list-heading"><span>WORKING NODES</span><button type="button" onClick={() => void addNode(response.id, null)}>＋ Add node</button></div>
          <div className="node-list">
            {response.nodes.filter((node) => !node.deletedAt && !node.parentId).sort((a,b) => a.position-b.position).map((node) => (
              <NodeEditor key={node.id} node={node} allNodes={response.nodes} onSave={saveNode} onShared={setShared} onAddChild={(parentId) => addNode(response.id,parentId)} onDelete={deleteNode} />
            ))}
            {!response.nodes.some((node) => !node.deletedAt && !node.parentId) && <div className="no-nodes">No working nodes yet. Create one from the original response.</div>}
          </div>
        </>
      )}
    </div>
  );
}

function NodeEditor({
  node,
  allNodes,
  onSave,
  onShared,
  onAddChild,
  onDelete,
}: {
  node: WorkingNode;
  allNodes: WorkingNode[];
  onSave: (id: string, content: string) => Promise<void>;
  onShared: (id: string, enabled: boolean) => Promise<void>;
  onAddChild: (parentId: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(node.content);
  const [saving, setSaving] = useState(false);
  const children = allNodes.filter((item) => item.parentId === node.id && !item.deletedAt).sort((a,b) => a.position-b.position);
  const dirty = draft !== node.content;

  useEffect(() => setDraft(node.content), [node.content]);

  async function save() {
    setSaving(true);
    try { await onSave(node.id, draft); }
    finally { setSaving(false); }
  }

  return (
    <div className={`node-entry ${node.parentId ? 'nested' : ''}`}>
      <div className="node-editor-card">
        <div className="node-editor-top">
          <span className="node-type">{node.provenance === 'captured' ? 'CAPTURED NODE' : node.provenance === 'human-edited' ? 'HUMAN EDITED' : 'USER NODE'}</span>
          <button type="button" onClick={() => void onDelete(node.id)}>Delete</button>
        </div>
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={Math.max(3, Math.min(8, draft.split('\n').length + 1))} placeholder="Edit this node…" />
        <div className="node-editor-actions">
          <button type="button" className={node.includeInModelContext ? 'shared' : ''} onClick={() => void onShared(node.id, !node.includeInModelContext)}>
            <span className="sharing-dot" />{node.includeInModelContext ? 'Shared with model' : 'Private edit'}
          </button>
          <div>
            {dirty && <button type="button" className="save-node" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>}
            <button type="button" onClick={() => void onAddChild(node.id)}>＋ Child</button>
          </div>
        </div>
      </div>
      {children.length > 0 && <div className="nested-nodes">{children.map((child) => <NodeEditor key={child.id} node={child} allNodes={allNodes} onSave={onSave} onShared={onShared} onAddChild={onAddChild} onDelete={onDelete} />)}</div>}
    </div>
  );
}

export default App;
