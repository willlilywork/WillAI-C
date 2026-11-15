import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MarkdownIt from 'markdown-it';
import './markdown.css';

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

const providerIcons: Record<Provider, string> = {
  chatgpt: '✳',
  claude: '✴',
  deepseek: '◈',
};

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});

function MarkdownContent({
  content,
  className = 'markdown-content',
}: {
  content: string;
  className?: string;
}) {
  const html = markdownRenderer.render(content || '');
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}


function App() {
  const [browserState, setBrowserState] = useState<BrowserState>({ tabs: [], activeTabId: null });
  const [snapshot, setSnapshot] = useState<WillAISnapshot>({ conversations: [] });
  const [address, setAddress] = useState('');
  const [search, setSearch] = useState('');
  const [browserOpen, setBrowserOpen] = useState(true);
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

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return snapshot.conversations;
    return snapshot.conversations.filter((conversation) =>
      conversation.title.toLowerCase().includes(query)
      || providerLabels[conversation.provider].toLowerCase().includes(query)
      || conversation.responses.some((response) => response.originalContent.toLowerCase().includes(query)),
    );
  }, [snapshot.conversations, search]);

  const responseCount = snapshot.conversations.reduce((total, item) => total + item.responses.length, 0);
  const nodeCount = snapshot.conversations.reduce(
    (total, item) => total + item.responses.reduce((sum, response) => sum + response.nodes.length, 0),
    0,
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
    if (!rect || !browserOpen) {
      void window.willai.setBrowserBounds({ x: 0, y: 0, width: 0, height: 0 });
      return;
    }
    void window.willai.setBrowserBounds({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    });
  }, [browserOpen]);

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
          setNotice('WillAI-C could not initialise its local workspace.');
          setLoading(false);
        }
      });

    const offBrowser = window.willai.onBrowserState(setBrowserState);
    const offCapture = window.willai.onCapture((result) => {
      setActiveConversationId(result.conversationId);
      setNotice(result.created
        ? 'Assistant response captured. It is now available in your WillAI workspace.'
        : 'This response was already present in the workspace.');
      void refreshSnapshot().catch(() => setNotice('The response event arrived, but the workspace could not refresh.'));
    });
    const offSnapshot = window.willai.onSnapshotChanged(() => {
      void refreshSnapshot().catch(() => {});
    });
    const offCaptureError = window.willai.onCaptureError((result) => {
      setNotice('Could not save the ' + (result.provider || 'AI') + ' response: ' + result.error);
    });
    const offInsert = window.willai.onContextInsertResult((result) => {
      setNotice(result.ok
        ? 'Selected context was inserted into the provider composer. Review it before sending.'
        : result.error || 'Could not insert shared context.');
    });

    return () => {
      alive = false;
      offBrowser();
      offCapture();
      offSnapshot();
      offCaptureError();
      offInsert();
    };
  }, [refreshSnapshot]);

  useEffect(() => {
    if (activeTab) setAddress(activeTab.url);
  }, [activeTab?.id, activeTab?.url]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !browserOpen) {
      updateBounds();
      return;
    }
    const observer = new ResizeObserver(updateBounds);
    observer.observe(host);
    window.addEventListener('resize', updateBounds);
    updateBounds();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateBounds);
      void window.willai.setBrowserBounds({ x: 0, y: 0, width: 0, height: 0 });
    };
  }, [updateBounds, browserOpen, loading]);

  async function navigate(value = address) {
    try {
      await window.willai.navigate(value);
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not navigate to this address.');
    }
  }

  async function openProvider(provider: Provider) {
    setBrowserOpen(true);
    const existing = browserState.tabs.find((tab) => {
      try {
        const host = new URL(tab.url).hostname.toLowerCase();
        if (provider === 'chatgpt') return host === 'chatgpt.com' || host === 'chat.openai.com';
        if (provider === 'claude') return host === 'claude.ai';
        return host === 'deepseek.com' || host.endsWith('.deepseek.com');
      } catch {
        return false;
      }
    });
    if (existing) {
      await window.willai.activateTab(existing.id);
    } else {
      await window.willai.createTab(providerUrls[provider]);
    }
  }

  function openConversation(conversation: Conversation) {
    setActiveConversationId(conversation.id);
    setBrowserOpen(true);
    const existing = browserState.tabs.find((tab) => {
      try {
        return new URL(tab.url).hostname === new URL(conversation.sourceUrl).hostname;
      } catch {
        return false;
      }
    });
    if (existing) {
      void window.willai.activateTab(existing.id);
      void window.willai.navigate(conversation.sourceUrl);
    } else {
      void window.willai.createTab(conversation.sourceUrl);
    }
  }

  async function insertContext() {
    if (!activeConversation) return;
    const result = await window.willai.insertContext(activeConversation.id);
    if (!result.ok) setNotice(result.error || 'Could not insert shared context.');
  }

  return (
    <div className="willai-app">
      <header className="app-header">
        <div className="app-brand">
          <span className="brand-mark">W</span>
          <span className="brand-word">WillAI<span>-C</span></span>
        </div>
        <div className="header-divider" />
        <div className="header-location">
          <span className="header-product">WORKSPACE</span>
          <span className="header-caption">Your conversations, responses and working knowledge</span>
        </div>
        <div className="header-actions">
          <button type="button" className="header-secondary" onClick={() => setBrowserOpen((value) => !value)}>
            {browserOpen ? 'Hide browser' : 'Open browser'}
          </button>
          <button type="button" className="header-primary" onClick={() => void openProvider('chatgpt')}>＋ New AI chat</button>
        </div>
      </header>

      {notice && (
        <button className="workspace-notice" type="button" onClick={() => setNotice('')} title="Dismiss notification">
          <span>{notice}</span><b>×</b>
        </button>
      )}

      <div className={'workspace-layout' + (browserOpen ? ' browser-visible' : '')}>
        <aside className="workspace-sidebar">
          <div className="sidebar-section">
            <div className="sidebar-kicker">WORKSPACE</div>
            <button type="button" className="sidebar-nav active" onClick={() => setActiveConversationId(null)}>
              <span className="nav-symbol">⌂</span><span>Overview</span>
            </button>
            <div className="sidebar-nav static-nav">
              <span className="nav-symbol">▤</span><span>Conversations</span><span className="nav-count">{snapshot.conversations.length}</span>
            </div>
          </div>

          <div className="sidebar-rule" />

          <div className="sidebar-section provider-section">
            <div className="sidebar-kicker">AI PROVIDERS</div>
            {(Object.keys(providerLabels) as Provider[]).map((provider) => (
              <button type="button" className="provider-launch" key={provider} onClick={() => void openProvider(provider)}>
                <span className={'provider-icon ' + provider}>{providerIcons[provider]}</span>
                <span>{providerLabels[provider]}</span>
                <span className="provider-launch-action">Open</span>
              </button>
            ))}
          </div>

          <div className="sidebar-rule" />

          <div className="sidebar-section conversation-section">
            <div className="sidebar-section-heading">
              <span className="sidebar-kicker">RECENT CONVERSATIONS</span>
              <span className="sidebar-count">{snapshot.conversations.length}</span>
            </div>
            <label className="conversation-search">
              <span>⌕</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter conversations" />
            </label>
            <div className="conversation-list">
              {filteredConversations.map((conversation) => (
                <button
                  type="button"
                  key={conversation.id}
                  className={'conversation-link' + (activeConversationId === conversation.id ? ' active' : '')}
                  onClick={() => openConversation(conversation)}
                  title={conversation.title}
                >
                  <span className={'provider-dot ' + conversation.provider} />
                  <span className="conversation-link-main">
                    <span className="conversation-link-title">{conversation.title}</span>
                    <small>{providerLabels[conversation.provider]} · {conversation.responses.length} responses</small>
                  </span>
                </button>
              ))}
              {!filteredConversations.length && (
                <div className="empty-sidebar">
                  {snapshot.conversations.length
                    ? 'No conversations match this filter.'
                    : 'Responses captured from your AI sessions will be stored here.'}
                </div>
              )}
            </div>
          </div>

          <div className="sidebar-footer">
            <span className="local-indicator" />
            <div><strong>Local workspace</strong><small>Your captured data stays on this device.</small></div>
          </div>
        </aside>

        <main className="workspace-main">
          {activeConversation ? (
            <ConversationWorkbench
              conversation={activeConversation}
              onRefresh={refreshSnapshot}
              onInsertContext={insertContext}
              onBack={() => setActiveConversationId(null)}
            />
          ) : (
            <WorkspaceHome
              conversations={snapshot.conversations}
              responseCount={responseCount}
              nodeCount={nodeCount}
              activeTab={activeTab}
              onOpenProvider={openProvider}
              onOpenConversation={openConversation}
            />
          )}
          {loading && <div className="workspace-loading">Initialising your workspace…</div>}
        </main>

        {browserOpen ? (
          <section className="browser-dock" aria-label="Integrated browser">
            <div className="browser-dock-top">
              <div className="browser-dock-title">
                <span className="dock-engine-mark">◉</span>
                <div><strong>Integrated browser</strong><small>Chromium runtime · inside WillAI-C</small></div>
              </div>
              <button type="button" className="dock-close" title="Hide browser" onClick={() => setBrowserOpen(false)}>×</button>
            </div>

            <div className="dock-tabs">
              {browserState.tabs.map((tab) => (
                <div className={'dock-tab' + (tab.id === browserState.activeTabId ? ' active' : '')} key={tab.id}>
                  <button type="button" className="dock-tab-select" onClick={() => void window.willai.activateTab(tab.id)} title={tab.url}>
                    {tab.provider
                      ? <span className={'provider-icon ' + tab.provider}>{providerIcons[tab.provider]}</span>
                      : <span className="provider-icon web">●</span>}
                    <span>{tab.title || 'New tab'}</span>
                  </button>
                  <button type="button" className="dock-tab-close" onClick={() => void window.willai.closeTab(tab.id)} title="Close tab">×</button>
                </div>
              ))}
              <button type="button" className="dock-new-tab" onClick={() => void window.willai.createTab('https://chatgpt.com/')} title="New AI tab">＋</button>
            </div>

            <div className="dock-toolbar">
              <div className="dock-nav-buttons">
                <button type="button" disabled={!activeTab?.canGoBack} onClick={() => void window.willai.goBack()} title="Back">←</button>
                <button type="button" disabled={!activeTab?.canGoForward} onClick={() => void window.willai.goForward()} title="Forward">→</button>
                <button type="button" onClick={() => void window.willai.reload()} title="Reload">{activeTab?.isLoading ? '×' : '↻'}</button>
              </div>
              <form className="dock-address-form" onSubmit={(event) => { event.preventDefault(); void navigate(); }}>
                <input
                  ref={addressRef}
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Search or enter a website"
                  spellCheck={false}
                  aria-label="Browser address"
                />
                <button type="submit">Go</button>
              </form>
            </div>

            <div className="browser-page-host" ref={hostRef} />
            <CaptureStatusPanel tab={activeTab} />
          </section>
        ) : (
          <button type="button" className="browser-reopen" onClick={() => setBrowserOpen(true)}>
            <span>◉</span> Show integrated browser
          </button>
        )}
      </div>
    </div>
  );
}

function WorkspaceHome({
  conversations,
  responseCount,
  nodeCount,
  activeTab,
  onOpenProvider,
  onOpenConversation,
}: {
  conversations: Conversation[];
  responseCount: number;
  nodeCount: number;
  activeTab: BrowserTab | null;
  onOpenProvider: (provider: Provider) => Promise<void>;
  onOpenConversation: (conversation: Conversation) => void;
}) {
  return (
    <div className="home-scroll">
      <div className="workspace-welcome">
        <div className="welcome-eyebrow">WILLAI-C WORKSPACE</div>
        <h1>Your work starts here.</h1>
        <p>Use the integrated browser to work with AI providers. Captured responses and editable working nodes belong to this workspace, not to the browser tab.</p>
      </div>

      <div className="workspace-metrics">
        <MetricCard label="CONVERSATIONS" value={conversations.length} detail="Saved from provider sessions" />
        <MetricCard label="ORIGINAL RESPONSES" value={responseCount} detail="Preserved source outputs" />
        <MetricCard label="WORKING NODES" value={nodeCount} detail="Editable workspace content" />
      </div>

      <section className="home-section">
        <div className="home-section-heading">
          <div><span className="section-eyebrow">CONNECTED TO YOUR WEB ACCOUNTS</span><h2>Start with an AI provider</h2></div>
          <span className="workspace-mode">BROWSER IS AN INTEGRATED TOOL</span>
        </div>
        <div className="provider-cards">
          {(Object.keys(providerLabels) as Provider[]).map((provider) => (
            <button type="button" className="provider-card" key={provider} onClick={() => void onOpenProvider(provider)}>
              <span className={'provider-card-icon ' + provider}>{providerIcons[provider]}</span>
              <span className="provider-card-name">{providerLabels[provider]}</span>
              <span className="provider-card-action">Open in browser <b>↗</b></span>
            </button>
          ))}
        </div>
        <div className="browser-context-note">
          <span className="note-icon">◉</span>
          <span>
            <strong>{activeTab?.title || 'No active browser tab'}</strong>
            <small>{activeTab?.url || 'Open ChatGPT, Claude or DeepSeek from the provider list.'}</small>
          </span>
        </div>
      </section>

      <section className="home-section recent-section">
        <div className="home-section-heading">
          <div><span className="section-eyebrow">YOUR LOCAL DATA</span><h2>Recent conversations</h2></div>
          <span className="section-count">{conversations.length}</span>
        </div>
        {conversations.length ? (
          <div className="recent-conversation-list">
            {conversations.slice(0, 8).map((conversation) => (
              <button key={conversation.id} type="button" className="recent-conversation" onClick={() => onOpenConversation(conversation)}>
                <span className={'provider-icon ' + conversation.provider}>{providerIcons[conversation.provider]}</span>
                <span className="recent-conversation-text"><strong>{conversation.title}</strong><small>{providerLabels[conversation.provider]} · {conversation.responses.length} original responses</small></span>
                <span className="recent-open">Open →</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="workspace-empty-state">
            <div className="empty-state-symbol">◇</div>
            <strong>No responses have reached the workspace yet.</strong>
            <p>Once the provider adapter detects a completed assistant response, WillAI-C will create a conversation record here and preserve the original output.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
      <small>{detail}</small>
    </div>
  );
}

function CaptureStatusPanel({ tab }: { tab: BrowserTab | null }) {
  const status = tab?.captureStatus ?? null;
  const stateLabel = !tab?.provider
    ? 'Not an AI provider'
    : !status
      ? 'Waiting for provider adapter'
      : status.state === 'ready'
        ? 'Adapter loaded'
        : status.state === 'no-message-elements'
          ? 'No assistant messages detected'
          : status.state === 'message-elements-found'
            ? 'Assistant messages detected'
            : status.state === 'response-sent'
              ? 'Response captured'
              : status.state === 'capture-error'
                ? 'Capture failed'
                : 'Adapter scanning';

  const stateClass = !tab?.provider
    ? 'neutral'
    : !status
      ? 'waiting'
      : status.state === 'capture-error' || status.state === 'no-message-elements'
        ? 'warning'
        : status.state === 'response-sent'
          ? 'success'
          : 'active';

  return (
    <div className="capture-status-panel">
      <span className={'capture-status-dot ' + stateClass} />
      <div className="capture-status-copy">
        <strong>{stateLabel}</strong>
        <small>{status?.message || (tab?.provider
          ? 'The page has not reported its adapter state yet.'
          : 'Open a supported AI provider to enable response capture.')}</small>
      </div>
      {status && <div className="capture-status-counts"><span>{status.candidateCount} candidates</span><span>{status.capturedCount} saved</span></div>}
    </div>
  );
}

function ConversationWorkbench({
  conversation,
  onRefresh,
  onInsertContext,
  onBack,
}: {
  conversation: Conversation;
  onRefresh: () => Promise<void>;
  onInsertContext: () => Promise<void>;
  onBack: () => void;
}) {
  const [selectedResponseId, setSelectedResponseId] = useState(conversation.responses.at(-1)?.id ?? null);

  useEffect(() => {
    setSelectedResponseId(conversation.responses.at(-1)?.id ?? null);
  }, [conversation.id, conversation.responses.length]);

  const response = conversation.responses.find((item) => item.id === selectedResponseId) ?? conversation.responses.at(-1) ?? null;
  const sharedCount = conversation.responses.flatMap((item) => item.nodes).filter((node) => node.includeInModelContext && !node.deletedAt).length;

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

  return (
    <div className="conversation-workspace">
      <div className="conversation-workspace-header">
        <button type="button" className="back-to-overview" onClick={onBack}>← Workspace overview</button>
        <div className="conversation-title-row">
          <span className={'provider-large-icon ' + conversation.provider}>{providerIcons[conversation.provider]}</span>
          <div><span className="section-eyebrow">{providerLabels[conversation.provider]} CONVERSATION</span><h1>{conversation.title}</h1></div>
        </div>
        <div className="conversation-subtitle">{conversation.sourceUrl} <span>·</span> {conversation.responses.length} original responses</div>
      </div>

      <div className="conversation-actions-row">
        <button type="button" className="insert-context-button" disabled={!conversation.sharedContextPreview} onClick={() => void onInsertContext()}>
          Add selected context to provider composer
        </button>
        <span className="shared-status">{sharedCount} nodes selected as model context · remaining nodes stay private</span>
      </div>

      <div className="response-workspace-scroll">
        <section className="response-navigation">
          <div className="section-eyebrow">ORIGINAL RESPONSES</div>
          <div className="response-navigation-list">
            {conversation.responses.map((item, index) => (
              <button key={item.id} type="button" className={'response-navigation-item' + (response?.id === item.id ? ' active' : '')} onClick={() => setSelectedResponseId(item.id)}>
                <span>Response {String(index + 1).padStart(2, '0')}</span>
                <small>{new Date(item.capturedAt).toLocaleString()}</small>
              </button>
            ))}
          </div>
        </section>

        {response && (
          <div className="response-editor-layout">
            <section className="original-response-card">
              <div className="response-card-heading"><span className="section-eyebrow">SOURCE RECORD</span><span className="read-only-label">Original response · read only</span></div>
              <MarkdownContent content={response.originalContent} className="source-markdown" />
            </section>

            <section className="working-nodes-section">
              <div className="working-nodes-heading">
                <div><span className="section-eyebrow">YOUR EDITABLE CONTENT</span><h2>Working nodes</h2></div>
                <button type="button" className="add-node-button" onClick={() => void addNode(response.id, null)}>＋ Add node</button>
              </div>
              <div className="node-list">
                {response.nodes.filter((node) => !node.deletedAt && !node.parentId).sort((a, b) => a.position - b.position).map((node) => (
                  <NodeEditor key={node.id} node={node} allNodes={response.nodes} onSave={saveNode} onShared={setShared} onAddChild={(parentId) => addNode(response.id, parentId)} onDelete={deleteNode} />
                ))}
                {!response.nodes.some((node) => !node.deletedAt && !node.parentId) && (
                  <div className="no-nodes">No working nodes yet. Add one to start editing or organising this response.</div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
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
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const children = allNodes.filter((item) => item.parentId === node.id && !item.deletedAt).sort((a, b) => a.position - b.position);
  const dirty = draft !== node.content;

  useEffect(() => {
    setDraft(node.content);
    setEditing(false);
  }, [node.content]);

  async function save() {
    setSaving(true);
    try {
      await onSave(node.id, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={'node-entry' + (node.parentId ? ' nested' : '')}>
      <div className="node-editor-card">
        <div className="node-editor-top">
          <span className="node-type">{node.provenance === 'captured' ? 'CAPTURED NODE' : node.provenance === 'human-edited' ? 'HUMAN EDITED' : 'USER NODE'}</span>
          <div className="node-top-actions">
            <button type="button" onClick={() => {
              if (editing) {
                setDraft(node.content);
                setEditing(false);
              } else {
                setEditing(true);
              }
            }}>{editing ? 'Cancel' : 'Edit'}</button>
            <button type="button" onClick={() => void onDelete(node.id)}>Delete</button>
          </div>
        </div>

        {editing ? (
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={Math.max(3, Math.min(12, draft.split('\n').length + 1))}
            placeholder="Edit this Markdown node…"
          />
        ) : (
          <div
            className="node-markdown"
            data-node-type={node.nodeType || 'paragraph'}
            data-list-ordered={node.listOrdered ? 'true' : 'false'}
            data-position={(node.listIndex ?? node.position) + (node.listStart || 1)}
          >
            <MarkdownContent content={node.content} className="node-markdown-body" />
          </div>
        )}

        <div className="node-editor-actions">
          <button type="button" className={node.includeInModelContext ? 'shared' : ''} onClick={() => void onShared(node.id, !node.includeInModelContext)}>
            <span className="sharing-dot" />{node.includeInModelContext ? 'Included in model context' : 'Keep private'}
          </button>
          <div>
            {editing && dirty && <button type="button" className="save-node" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'}</button>}
            <button type="button" onClick={() => void onAddChild(node.id)}>＋ Child node</button>
          </div>
        </div>
      </div>
      {children.length > 0 && (
        <div className="nested-nodes">
          {children.map((child) => <NodeEditor key={child.id} node={child} allNodes={allNodes} onSave={onSave} onShared={onShared} onAddChild={onAddChild} onDelete={onDelete} />)}
        </div>
      )}
    </div>
  );
}
export default App;
