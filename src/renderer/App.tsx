import { useCallback, useEffect, useMemo, useState } from 'react';

const providerLabels: Record<Provider, string> = {
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  deepseek: 'DeepSeek',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function App() {
  const [snapshot, setSnapshot] = useState<WillAISnapshot>({ conversations: [] });
  const [bridge, setBridge] = useState<BridgeInfo | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [bridgeDetailsOpen, setBridgeDetailsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [nextSnapshot, nextBridge] = await Promise.all([
      window.willai.getSnapshot(),
      window.willai.getBridgeInfo(),
    ]);
    setSnapshot(nextSnapshot);
    setBridge(nextBridge);
    setActiveConversationId((current) =>
      current && nextSnapshot.conversations.some((conversation) => conversation.id === current)
        ? current
        : nextSnapshot.conversations[0]?.id ?? null,
    );
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.all([window.willai.getSnapshot(), window.willai.getBridgeInfo()])
      .then(([nextSnapshot, nextBridge]) => {
        if (!mounted) return;
        setSnapshot(nextSnapshot);
        setBridge(nextBridge);
        setActiveConversationId(nextSnapshot.conversations[0]?.id ?? null);
      })
      .catch(() => setNotice('WillAI-C could not load its local workspace.'))
      .finally(() => mounted && setLoading(false));

    const unsubscribe = window.willai.onCapture((payload) => {
      setActiveConversationId(payload.conversationId);
      setNotice('A response was captured from your browser.');
      refresh().catch(() => setNotice('The response was captured, but the workspace could not refresh.'));
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [refresh]);

  const activeConversation = useMemo(
    () => snapshot.conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [snapshot.conversations, activeConversationId],
  );

  async function copyContext() {
    if (!activeConversation?.sharedContextPreview) return;
    await window.willai.copyText(activeConversation.sharedContextPreview);
    setNotice('Shared context copied to the clipboard.');
  }

  async function copyPairingToken() {
    if (!bridge?.token) return;
    await window.willai.copyText(bridge.token);
    setNotice('Pairing token copied. Paste it into the WillAI-C browser extension.');
  }

  async function addRootNode(responseId: string) {
    await window.willai.createChildNode(responseId, null);
    await refresh();
    setNotice('A new working node was created.');
  }

  async function createChild(responseId: string, parentId: string) {
    await window.willai.createChildNode(responseId, parentId);
    await refresh();
    setNotice('A child node was created.');
  }

  async function updateNode(nodeId: string, content: string) {
    await window.willai.updateNode(nodeId, content);
    await refresh();
    setNotice('Node saved.');
  }

  async function setNodeContext(nodeId: string, enabled: boolean) {
    await window.willai.setNodeContext(nodeId, enabled);
    await refresh();
    setNotice(enabled ? 'Node added to shared model context.' : 'Node kept private in WillAI-C.');
  }

  async function deleteNode(nodeId: string) {
    await window.willai.deleteNode(nodeId);
    await refresh();
    setNotice('Node and its child nodes were deleted.');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">W</div>
          <div>
            <div className="brand-name">WillAI<span>-C</span></div>
            <div className="brand-caption">CONNECT · RESPONSE WORKSPACE</div>
          </div>
        </div>

        <div className="sidebar-section-label">WORKSPACE</div>
        <button className="nav-item active" type="button">
          <span className="nav-symbol">▤</span>
          <span>Captured work</span>
          <span className="nav-count">{snapshot.conversations.length}</span>
        </button>
        <div className="conversation-heading">
          <span>Conversations</span>
          <span>{snapshot.conversations.length}</span>
        </div>
        <div className="conversation-list">
          {snapshot.conversations.map((conversation) => (
            <button
              className={`conversation-item ${activeConversationId === conversation.id ? 'selected' : ''}`}
              type="button"
              key={conversation.id}
              onClick={() => setActiveConversationId(conversation.id)}
            >
              <span className={`provider-dot ${conversation.provider}`} />
              <span className="conversation-copy">
                <span className="conversation-title">{conversation.title}</span>
                <span className="conversation-meta">{providerLabels[conversation.provider]} · {conversation.responses.length} response{conversation.responses.length === 1 ? '' : 's'}</span>
              </span>
            </button>
          ))}
          {!snapshot.conversations.length && !loading && (
            <div className="sidebar-empty">Captured conversations will appear here.</div>
          )}
        </div>

        <div className="sidebar-bottom">
          <div className="local-status"><span className="status-dot" /> Local workspace</div>
          <div className="local-status-sub">Your captured work stays on this device.</div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{activeConversation?.title ?? 'Getting started'}</strong></div>
          <div className="topbar-actions">
            <div className={`bridge-pill ${bridge?.running ? 'connected' : 'disconnected'}`}>
              <span className="status-dot" />
              {bridge?.running ? 'Browser bridge ready' : 'Browser bridge offline'}
            </div>
            <button className="icon-button" type="button" aria-label="Show browser connection setup" onClick={() => setBridgeDetailsOpen((open) => !open)}>⌘</button>
          </div>
        </header>

        {notice && <button type="button" className="notice" onClick={() => setNotice('')}>{notice}<span>×</span></button>}

        {loading ? (
          <div className="loading-state">Opening your local workspace…</div>
        ) : activeConversation ? (
          <div className="workspace-layout">
            <section className="work-column">
              <div className="page-heading">
                <div>
                  <div className="eyebrow">RESPONSE WORKSPACE</div>
                  <h1>{activeConversation.title}</h1>
                  <p className="page-subtitle">Captured from {providerLabels[activeConversation.provider]}. Edit individual nodes without changing the source response.</p>
                </div>
                <button className="source-link" type="button" onClick={() => window.willai.openSourceUrl(activeConversation.sourceUrl)} title={activeConversation.sourceUrl}>
                  <span>↗</span> Open source conversation
                </button>
              </div>

              <div className="response-stack">
                {activeConversation.responses.map((response, index) => (
                  <section className="response-card" key={response.id}>
                    <div className="response-card-head">
                      <div className="response-label-wrap">
                        <span className="response-index">{String(index + 1).padStart(2, '0')}</span>
                        <div>
                          <div className="response-title">Original response</div>
                          <div className="response-time">Captured {formatDate(response.capturedAt)}</div>
                        </div>
                      </div>
                      <span className="immutable-label"><span>◈</span> SOURCE PRESERVED</span>
                    </div>

                    <details className="original-details">
                      <summary>View original response <span>Read-only source</span></summary>
                      <pre>{response.originalContent}</pre>
                    </details>

                    <div className="nodes-heading">
                      <div>
                        <span className="nodes-title">Working nodes</span>
                        <span className="nodes-help">Independent, editable units</span>
                      </div>
                      <button className="text-button" type="button" onClick={() => addRootNode(response.id)}>＋ Add node</button>
                    </div>

                    <div className="node-tree">
                      {response.nodes.filter((node) => node.parentId === null).sort((a, b) => a.position - b.position).map((node) => (
                        <NodeEditor
                          key={node.id}
                          node={node}
                          allNodes={response.nodes}
                          onSave={updateNode}
                          onToggleContext={setNodeContext}
                          onCreateChild={(parentId) => createChild(response.id, parentId)}
                          onDelete={deleteNode}
                        />
                      ))}
                      {!response.nodes.some((node) => node.parentId === null) && (
                        <div className="empty-nodes">No working nodes in this response. Add one to start shaping the content.</div>
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </section>

            <aside className="inspector">
              <div className="inspector-heading">
                <div className="eyebrow">CONTEXT CONTROL</div>
                <h2>Model context</h2>
                <p>Only nodes you explicitly share are included when you insert context into the AI conversation.</p>
              </div>
              <div className="context-count-row">
                <span>Shared content</span>
                <strong>{countSharedNodes(activeConversation)} nodes</strong>
              </div>
              <div className="context-preview">
                {activeConversation.sharedContextPreview ? (
                  <pre>{activeConversation.sharedContextPreview}</pre>
                ) : (
                  <div className="context-empty">
                    <div className="context-empty-icon">◉</div>
                    <strong>Nothing shared yet</strong>
                    <span>Keep edits private, or enable “Share with model” on a node to include it here.</span>
                  </div>
                )}
              </div>
              <button className="primary-button context-copy-button" type="button" disabled={!activeConversation.sharedContextPreview} onClick={copyContext}>Copy shared context</button>
              <div className="inspector-note"><span>i</span><p>Inserting context never submits a prompt. You can review and edit it in the AI composer before sending.</p></div>
              <div className="inspector-divider" />
              <div className="source-info">
                <div className="eyebrow">SOURCE</div>
                <div className="source-provider"><span className={`provider-dot ${activeConversation.provider}`} />{providerLabels[activeConversation.provider]}</div>
                <div className="source-url">{activeConversation.sourceUrl}</div>
              </div>
            </aside>
          </div>
        ) : (
          <GettingStarted bridge={bridge} onCopyToken={copyPairingToken} />
        )}

        {bridgeDetailsOpen && (
          <div className="bridge-popover">
            <div className="bridge-popover-head">
              <div><div className="eyebrow">LOCAL CONNECTION</div><strong>Connect your browser</strong></div>
              <button type="button" className="close-button" onClick={() => setBridgeDetailsOpen(false)}>×</button>
            </div>
            <p>Install the WillAI-C extension, then paste this pairing token into its popup. The local bridge listens only on this computer.</p>
            <div className="token-box"><code>{bridge?.token ?? 'Unavailable'}</code><button type="button" onClick={copyPairingToken}>Copy</button></div>
            <div className="bridge-address">http://{bridge?.host}:{bridge?.port}</div>
            <div className="bridge-state"><span className={`status-dot ${bridge?.running ? '' : 'off'}`} />{bridge?.running ? 'Bridge listening' : 'Bridge not running — check whether port 43821 is already in use.'}</div>
          </div>
        )}
      </main>
    </div>
  );
}

function countSharedNodes(conversation: Conversation) {
  return conversation.responses.flatMap((response) => response.nodes)
    .filter((node) => node.includeInModelContext && node.content.trim()).length;
}

function GettingStarted({ bridge, onCopyToken }: { bridge: BridgeInfo | null; onCopyToken: () => void }) {
  return (
    <div className="getting-started">
      <div className="welcome-mark">W<span>·</span>C</div>
      <div className="eyebrow">WILLAI-C CONNECT</div>
      <h1>Your responses.<br /><em>Your working material.</em></h1>
      <p className="welcome-copy">WillAI-C sits beside the AI websites you already use. Capture an answer, work with its parts here, and decide exactly what the model can see next time.</p>
      <div className="setup-grid">
        <div className="setup-step"><span>01</span><div><strong>Open the desktop workspace</strong><p>WillAI-C owns the workspace. Your AI provider stays in your normal browser.</p></div></div>
        <div className="setup-step"><span>02</span><div><strong>Install the browser extension</strong><p>Load the <code>extension</code> folder as an unpacked extension in Chrome or Edge.</p></div></div>
        <div className="setup-step"><span>03</span><div><strong>Pair this device</strong><p>Copy the token below and paste it into the extension popup.</p></div></div>
      </div>
      <div className="pairing-card">
        <div><span className="eyebrow">LOCAL PAIRING TOKEN</span><code>{bridge?.token ?? 'Bridge unavailable'}</code></div>
        <button className="primary-button" type="button" onClick={onCopyToken} disabled={!bridge?.token}>Copy token</button>
      </div>
      <div className="welcome-footnote"><span className={`status-dot ${bridge?.running ? '' : 'off'}`} />{bridge?.running ? 'Local bridge ready' : 'Local bridge is unavailable. Check port 43821.'} · No provider API key required</div>
    </div>
  );
}

function NodeEditor({
  node,
  allNodes,
  onSave,
  onToggleContext,
  onCreateChild,
  onDelete,
}: {
  node: WorkingNode;
  allNodes: WorkingNode[];
  onSave: (nodeId: string, content: string) => Promise<void>;
  onToggleContext: (nodeId: string, enabled: boolean) => Promise<void>;
  onCreateChild: (parentId: string) => Promise<void>;
  onDelete: (nodeId: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(node.content);
  const [saving, setSaving] = useState(false);
  const children = allNodes.filter((item) => item.parentId === node.id).sort((a, b) => a.position - b.position);
  const dirty = draft !== node.content;

  useEffect(() => setDraft(node.content), [node.content]);

  async function save() {
    setSaving(true);
    try { await onSave(node.id, draft); }
    finally { setSaving(false); }
  }

  return (
    <div className={`node-item ${node.parentId ? 'child-node' : ''}`}>
      <div className="node-card">
        <div className="node-card-top">
          <div className="node-identity"><span className="node-grip">⠿</span><span className="node-kind">{node.parentId ? 'CHILD NODE' : 'NODE'}</span><span className={`provenance provenance-${node.provenance}`}>{node.provenance === 'captured' ? 'Captured' : node.provenance === 'human-edited' ? 'Human edited' : 'User created'}</span></div>
          <button className="delete-button" type="button" title="Delete node and its children" onClick={() => {
            if (window.confirm('Delete this node and all of its child nodes?')) onDelete(node.id);
          }}>Delete</button>
        </div>
        <textarea
          className="node-editor"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Write or revise this working node…"
          rows={Math.min(8, Math.max(3, draft.split('\n').length + 1))}
          aria-label="Working node content"
        />
        <div className="node-card-bottom">
          <button
            type="button"
            className={`context-toggle ${node.includeInModelContext ? 'enabled' : ''}`}
            aria-pressed={node.includeInModelContext}
            onClick={() => onToggleContext(node.id, !node.includeInModelContext)}
          >
            <span className="toggle-indicator" />{node.includeInModelContext ? 'Shared with model' : 'Private edit'}
          </button>
          <div className="node-actions">
            {dirty && <button type="button" className="save-node-button" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save changes'}</button>}
            <button type="button" className="subnode-button" onClick={() => onCreateChild(node.id)}>＋ Add child</button>
          </div>
        </div>
      </div>
      {children.length > 0 && (
        <div className="child-node-list">
          {children.map((child) => (
            <NodeEditor
              key={child.id}
              node={child}
              allNodes={allNodes}
              onSave={onSave}
              onToggleContext={onToggleContext}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default App;
