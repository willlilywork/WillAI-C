import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import MarkdownIt from 'markdown-it';
import './markdown.css';
import WorkspaceTools from './WorkspaceTools';

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
  const [snapshot, setSnapshot] = useState<WillAISnapshot>({
    conversations: [], folders: [], prompts: [], promptHistory: [], notes: [],
    bookmarks: [], browserHistory: [], promptQueue: [], settings: { autoArchiveDays: 0, autoDeleteDays: 0 },
  });
  const [address, setAddress] = useState('');
  const [search, setSearch] = useState('');
  const [browserOpen, setBrowserOpen] = useState(false);
  const [panelSizes, setPanelSizes] = useState(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('willai-panel-sizes') || '{}');
      return { sidebar: Math.min(360, Math.max(170, Number(saved.sidebar) || 232)), browser: Math.min(900, Math.max(250, Number(saved.browser) || 430)) };
    } catch { return { sidebar: 232, browser: 430 }; }
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<'newchat' | 'overview' | 'prompts' | 'notes' | 'library'>('newchat');
  const [selectedProvider, setSelectedProvider] = useState<Provider>('chatgpt');
  const [draftPrompt, setDraftPrompt] = useState('');
  const [pendingPrompt, setPendingPrompt] = useState<{provider: Provider; content: string; dispatched: boolean} | null>(null);
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [bulkSelection, setBulkSelection] = useState<string[]>([]);
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
    const folderIds = new Set<string>();
    if (folderFilter) {
      const collect = (parentId: string) => {
        folderIds.add(parentId);
        for (const folder of snapshot.folders.filter((item) => item.parentId === parentId)) collect(folder.id);
      };
      collect(folderFilter);
    }
    return snapshot.conversations
      .filter((conversation) => showArchived ? Boolean(conversation.archivedAt) : !conversation.archivedAt)
      .filter((conversation) => !folderFilter || folderIds.has(conversation.folderId || ''))
      .filter((conversation) => !query
        || conversation.title.toLowerCase().includes(query)
        || providerLabels[conversation.provider].toLowerCase().includes(query)
        || conversation.responses.some((response) => response.originalContent.toLowerCase().includes(query)))
      .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt.localeCompare(a.updatedAt));
  }, [snapshot.conversations, snapshot.folders, search, folderFilter, showArchived]);

  const responseCount = snapshot.conversations.reduce((total, item) => total + item.responses.length, 0);
  const nodeCount = snapshot.conversations.reduce(
    (total, item) => total + item.responses.reduce((sum, response) => sum + response.nodes.length, 0),
    0,
  );

  const refreshSnapshot = useCallback(async () => {
    const next = await window.willai.getSnapshot();
    setSnapshot(next);
    setActiveConversationId((current) => {
      const folderIds = new Set<string>();
      if (folderFilter) {
        const collect = (parentId: string) => {
          folderIds.add(parentId);
          for (const folder of next.folders.filter((item) => item.parentId === parentId)) collect(folder.id);
        };
        collect(folderFilter);
      }
      const eligible = next.conversations.filter((item) =>
        (showArchived ? Boolean(item.archivedAt) : !item.archivedAt)
        && (!folderFilter || folderIds.has(item.folderId || '')),
      );
      if (current && eligible.some((item) => item.id === current)) return current;
      return eligible[0]?.id ?? null;
    });
  }, [folderFilter, showArchived]);

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
    try { window.localStorage.setItem('willai-panel-sizes', JSON.stringify(panelSizes)); } catch { /* Optional persistence. */ }
  }, [panelSizes]);

  useEffect(() => {
    let alive = true;
    Promise.all([window.willai.getBrowserState(), window.willai.getSnapshot()])
      .then(([nextBrowser, nextSnapshot]) => {
        if (!alive) return;
        setBrowserState(nextBrowser);
        setSnapshot(nextSnapshot);
        setActiveConversationId(null);
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
      setWorkspaceView('overview');
      setBrowserOpen(false);
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
      setPendingPrompt(null);
      setNotice(result.ok
        ? 'Text inserted into the provider composer. Review it before sending.'
        : result.error || 'Could not insert text into the provider composer.');
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
    if (!pendingPrompt || pendingPrompt.dispatched || activeTab?.provider !== pendingPrompt.provider) return;
    const state = activeTab.captureStatus?.state;
    if (!state || !['ready', 'no-message-elements', 'message-elements-found', 'response-sent'].includes(state)) return;

    const pending = pendingPrompt;
    setPendingPrompt({ ...pending, dispatched: true });
    void window.willai.insertPrompt(pending.content).then(async (result) => {
      if (!result.ok) {
        setPendingPrompt(null);
        setNotice(result.error || 'Could not insert the prompt into the provider composer.');
        return;
      }
      await window.willai.recordPromptHistory(pending.content, pending.provider);
    }).catch((error) => {
      setPendingPrompt(null);
      setNotice(error instanceof Error ? error.message : 'Could not insert the prompt.');
    });
  }, [pendingPrompt, activeTab?.id, activeTab?.provider, activeTab?.captureStatus?.state]);

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
    setWorkspaceView('overview');
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
    setWorkspaceView('overview');
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

  async function startPromptInProvider(provider: Provider, value: string) {
    const content = value.trim();
    if (!content || pendingPrompt) return;

    setSelectedProvider(provider);
    setPendingPrompt({ provider, content, dispatched: false });
    setBrowserOpen(true);
    setNotice('Opening ' + providerLabels[provider] + ' and preparing your prompt…');

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

    try {
      if (existing) await window.willai.activateTab(existing.id);
      else await window.willai.createTab(providerUrls[provider]);
    } catch (error) {
      setPendingPrompt(null);
      setNotice(error instanceof Error ? error.message : 'Could not open the selected provider.');
    }
  }

  async function insertContext() {
    if (!activeConversation) return;
    const result = await window.willai.insertContext(activeConversation.id);
    if (!result.ok) setNotice(result.error || 'Could not insert shared context.');
  }

  async function createFolder(parentId: string | null = null) {
    const name = window.prompt(parentId ? 'Subfolder name' : 'Folder name');
    if (!name?.trim()) return;
    await window.willai.createFolder({ name: name.trim(), parentId });
    await refreshSnapshot();
  }

  async function deleteFolder(folder: WorkspaceFolder) {
    if (!window.confirm('Delete "' + folder.name + '"? Conversations will move to its parent folder.')) return;
    await window.willai.deleteFolder(folder.id);
    if (folderFilter === folder.id) setFolderFilter(folder.parentId || null);
    await refreshSnapshot();
  }

  async function toggleConversationSelection(conversationId: string) {
    setBulkSelection((current) => current.includes(conversationId)
      ? current.filter((id) => id !== conversationId)
      : [...current, conversationId]);
  }

  async function deleteSelectedConversations() {
    if (!bulkSelection.length) return;
    if (!window.confirm('Permanently delete ' + bulkSelection.length + ' selected conversations?')) return;
    const result = await window.willai.bulkDeleteConversations(bulkSelection);
    setBulkSelection([]);
    setNotice(result.deleted + ' conversations deleted.');
    await refreshSnapshot();
  }

  async function setConversationFlag(conversationId: string, patch: {pinned?: boolean; archived?: boolean}) {
    await window.willai.setConversationFlags(conversationId, patch);
    await refreshSnapshot();
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
          <button type="button" className="header-secondary" onClick={() => setWorkspaceView('prompts')}>Prompts</button>
          <button type="button" className="header-secondary" onClick={() => setWorkspaceView('notes')}>Notes</button>
          <button type="button" className="header-secondary" onClick={() => setBrowserOpen((value) => !value)}>
            {browserOpen ? 'Hide browser' : 'Open browser'}
          </button>
          <button type="button" className="header-primary" onClick={() => { setWorkspaceView('newchat'); setActiveConversationId(null); setBrowserOpen(false); }}>＋ New conversation</button>
        </div>
      </header>

      {notice && (
        <button className="workspace-notice" type="button" onClick={() => setNotice('')} title="Dismiss notification">
          <span>{notice}</span><b>×</b>
        </button>
      )}

      <div className={'workspace-layout' + (browserOpen ? ' browser-visible' : '')} style={{ '--sidebar-width': `${panelSizes.sidebar}px`, '--browser-width': `${panelSizes.browser}px` } as CSSProperties}>
        <aside className="workspace-sidebar">
          <div className="sidebar-section">
            <div className="sidebar-kicker">WORKSPACE</div>
            <button type="button" className={'sidebar-nav' + (workspaceView === 'newchat' ? ' active' : '')} onClick={() => { setWorkspaceView('newchat'); setActiveConversationId(null); setBrowserOpen(false); }}>
              <span className="nav-symbol">＋</span><span>New Conversation</span>
            </button>
            <button type="button" className={'sidebar-nav' + (workspaceView === 'overview' ? ' active' : '')} onClick={() => { setWorkspaceView('overview'); setFolderFilter(null); setShowArchived(false); }}>
              <span className="nav-symbol">⌂</span><span>Overview</span>
            </button>
            <button type="button" className={'sidebar-nav' + (workspaceView === 'prompts' ? ' active' : '')} onClick={() => setWorkspaceView('prompts')}>
              <span className="nav-symbol">✎</span><span>Prompt Manager</span><span className="nav-count">{snapshot.prompts.length}</span>
            </button>
            <button type="button" className={'sidebar-nav' + (workspaceView === 'notes' ? ' active' : '')} onClick={() => setWorkspaceView('notes')}>
              <span className="nav-symbol">▧</span><span>Notes</span><span className="nav-count">{snapshot.notes.length}</span>
            </button>
            <button type="button" className={'sidebar-nav' + (workspaceView === 'library' ? ' active' : '')} onClick={() => setWorkspaceView('library')}>
              <span className="nav-symbol">⌖</span><span>Bookmarks & History</span>
            </button>
          </div>

          <div className="sidebar-rule" />

          <div className="sidebar-section folder-section">
            <div className="sidebar-section-heading">
              <span className="sidebar-kicker">FOLDERS</span>
              <button type="button" className="sidebar-add" onClick={() => void createFolder(null)}>＋</button>
            </div>
            <button type="button" className={'folder-filter' + (!folderFilter && !showArchived ? ' active' : '')} onClick={() => { setFolderFilter(null); setShowArchived(false); setWorkspaceView('overview'); }}>
              <span>All conversations</span><small>{snapshot.conversations.filter((item) => !item.archivedAt).length}</small>
            </button>
            {snapshot.folders.filter((folder) => !folder.parentId).map((folder) => (
              <FolderSidebarItem
                key={folder.id}
                folder={folder}
                allFolders={snapshot.folders}
                activeId={folderFilter}
                onSelect={(id) => { setFolderFilter(id); setShowArchived(false); setWorkspaceView('overview'); }}
                onAddChild={(id) => void createFolder(id)}
                onDelete={deleteFolder}
              />
            ))}
            <button type="button" className={'folder-filter' + (showArchived ? ' active' : '')} onClick={() => { setShowArchived(true); setFolderFilter(null); setWorkspaceView('overview'); }}>
              <span>Archived</span><small>{snapshot.conversations.filter((item) => item.archivedAt).length}</small>
            </button>
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
            {bulkSelection.length > 0 && (
              <div className="bulk-actions">
                <span>{bulkSelection.length} selected</span>
                <button type="button" onClick={() => void deleteSelectedConversations()}>Delete</button>
                <button type="button" onClick={() => setBulkSelection([])}>Clear</button>
              </div>
            )}
            <div className="conversation-list">
              {filteredConversations.map((conversation) => (
                <div className="conversation-row" key={conversation.id}>
                  <input
                    type="checkbox"
                    checked={bulkSelection.includes(conversation.id)}
                    onChange={() => void toggleConversationSelection(conversation.id)}
                    aria-label={'Select ' + conversation.title}
                  />
                  <button
                    type="button"
                    className={'conversation-link' + (activeConversationId === conversation.id && workspaceView === 'overview' ? ' active' : '')}
                    onClick={() => openConversation(conversation)}
                    title={conversation.title}
                  >
                    <span className={'provider-dot ' + conversation.provider} />
                    <span className="conversation-link-main">
                      <span className="conversation-link-title">{conversation.pinned ? '★ ' : ''}{conversation.title}</span>
                      <small>{providerLabels[conversation.provider]} · {conversation.responses.length} responses · {new Date(conversation.updatedAt).toLocaleDateString()}</small>
                    </span>
                  </button>
                  <button type="button" className="conversation-row-more" title={conversation.pinned ? 'Unpin conversation' : 'Pin conversation'} onClick={() => void setConversationFlag(conversation.id, { pinned: !conversation.pinned })}>{conversation.pinned ? '★' : '☆'}</button>
                </div>
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
        <ResizeHandle label="Resize workspace sidebar" value={panelSizes.sidebar} min={170} max={360}
          onChange={(value) => setPanelSizes((current) => ({ ...current, sidebar: value }))} />

        <main className="workspace-main">
          {workspaceView === 'newchat' ? (
            <NewConversation
              provider={selectedProvider}
              onProviderChange={setSelectedProvider}
              prompt={draftPrompt}
              onPromptChange={setDraftPrompt}
              onSubmit={() => void startPromptInProvider(selectedProvider, draftPrompt)}
              pending={Boolean(pendingPrompt)}
              disabled={loading}
            />
          ) : workspaceView === 'prompts' ? (
            <WorkspaceTools mode="prompts" snapshot={snapshot} activeConversation={activeConversation} activeTab={activeTab} onRefresh={refreshSnapshot} onNotice={setNotice} />
          ) : workspaceView === 'notes' ? (
            <WorkspaceTools mode="notes" snapshot={snapshot} activeConversation={activeConversation} activeTab={activeTab} onRefresh={refreshSnapshot} onNotice={setNotice} />
          ) : workspaceView === 'library' ? (
            <WorkspaceTools mode="library" snapshot={snapshot} activeConversation={activeConversation} activeTab={activeTab} onRefresh={refreshSnapshot} onNotice={setNotice} />
          ) : activeConversation ? (
            <ConversationWorkbench
              conversation={activeConversation}
              allConversations={snapshot.conversations}
              folders={snapshot.folders}
              onRefresh={refreshSnapshot}
              onInsertContext={insertContext}
              onBack={() => { setActiveConversationId(null); setWorkspaceView('overview'); }}
              onOpenNotes={() => setWorkspaceView('notes')}
              onNotice={setNotice}
            />
          ) : (
            <WorkspaceHome
              conversations={filteredConversations}
              responseCount={responseCount}
              nodeCount={nodeCount}
              activeTab={activeTab}
              onOpenProvider={openProvider}
              onOpenConversation={openConversation}
            />
          )}
          {loading && <div className="workspace-loading">Initialising your workspace…</div>}
        </main>
        {browserOpen && (
          <ResizeHandle label="Resize integrated browser" value={panelSizes.browser} min={250} max={900} reverse
            onChange={(value) => setPanelSizes((current) => ({ ...current, browser: value }))} />
        )}

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

function ResizeHandle({
  label, value, min, max, reverse = false, onChange,
}: {
  label: string; value: number; min: number; max: number; reverse?: boolean; onChange: (value: number) => void;
}) {
  const drag = useRef<{ pointerId: number; startX: number; startValue: number } | null>(null);
  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startValue: value };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const delta = event.clientX - start.startX;
    onChange(Math.min(max, Math.max(min, Math.round(start.startValue + (reverse ? -delta : delta)))));
  }
  function stopDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    onChange(Math.min(max, Math.max(min, value + direction * (reverse ? -16 : 16))));
  }
  return <div className="panel-resizer" role="separator" aria-orientation="vertical" aria-label={label}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)} tabIndex={0}
    title={label + ' · drag to resize'} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
    onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={onKeyDown} />;
}

function FolderSidebarItem({
  folder,
  allFolders,
  activeId,
  onSelect,
  onAddChild,
  onDelete,
  depth = 0,
}: {
  folder: WorkspaceFolder;
  allFolders: WorkspaceFolder[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAddChild: (id: string) => void;
  onDelete: (folder: WorkspaceFolder) => void;
  depth?: number;
}) {
  const children = allFolders.filter((item) => item.parentId === folder.id);
  return (
    <div className="folder-tree-item">
      <div className={'folder-filter-row' + (activeId === folder.id ? ' active' : '')}>
        <button type="button" className="folder-filter" style={{ paddingLeft: 10 + depth * 13, borderLeftColor: folder.color }} onClick={() => onSelect(folder.id)}>
          <span>{folder.icon} {folder.name}</span>
          {children.length > 0 && <small>{children.length} subfolders</small>}
        </button>
        <button type="button" className="folder-row-action" title="Add subfolder" onClick={() => onAddChild(folder.id)}>＋</button>
        <button type="button" className="folder-row-action" title="Delete folder" onClick={() => onDelete(folder)}>×</button>
      </div>
      {children.map((child) => (
        <FolderSidebarItem
          key={child.id}
          folder={child}
          allFolders={allFolders}
          activeId={activeId}
          onSelect={onSelect}
          onAddChild={onAddChild}
          onDelete={onDelete}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}

function NewConversation({
  provider,
  onProviderChange,
  prompt,
  onPromptChange,
  onSubmit,
  pending,
  disabled,
}: {
  provider: Provider;
  onProviderChange: (provider: Provider) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  pending: boolean;
  disabled: boolean;
}) {
  return (
    <div className="new-conversation-screen">
      <div className="new-conversation-content">
        <div className="new-conversation-mark"><span>W</span></div>
        <div className="new-conversation-eyebrow">WILLAI-C WORKSPACE</div>
        <h1>What would you like to work on?</h1>
        <p className="new-conversation-description">
          Start with a prompt. Your provider response will be captured into this workspace, where you can preserve the original and work with its content.
        </p>

        <form className="new-conversation-composer" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
          <textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder="Ask a question, describe a task, or start exploring an idea…"
            rows={5}
            aria-label="New conversation prompt"
            autoFocus
          />
          <div className="new-conversation-composer-footer">
            <label className="new-conversation-provider">
              <span>Provider</span>
              <select value={provider} onChange={(event) => onProviderChange(event.target.value as Provider)} disabled={pending}>
                {(Object.keys(providerLabels) as Provider[]).map((item) => (
                  <option value={item} key={item}>{providerLabels[item]}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="new-conversation-submit" disabled={disabled || pending || !prompt.trim()}>
              {pending ? 'Preparing prompt…' : 'Open provider and insert prompt'} <span>↗</span>
            </button>
          </div>
        </form>

        <div className="new-conversation-footnote">
          <span className="new-conversation-status-dot" />
          Uses your existing signed-in provider session. WillAI-C inserts the prompt for review; you submit it on the provider page.
        </div>
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
  conversation, allConversations, folders, onRefresh, onInsertContext, onBack, onOpenNotes, onNotice,
}: {
  conversation: Conversation;
  allConversations: Conversation[];
  folders: WorkspaceFolder[];
  onRefresh: () => Promise<void>;
  onInsertContext: () => Promise<void>;
  onBack: () => void;
  onOpenNotes: () => void;
  onNotice: (message: string) => void;
}) {
  const [selectedResponseId, setSelectedResponseId] = useState(conversation.responses.at(-1)?.id ?? null);
  const [referencesOpen, setReferencesOpen] = useState(false);
  const [sourcePaneWidth, setSourcePaneWidth] = useState(() => {
    try {
      const saved = Number(window.localStorage.getItem('willai-source-pane-width'));
      return Math.min(900, Math.max(280, saved || 450));
    } catch { return 450; }
  });
  useEffect(() => {
    try { window.localStorage.setItem('willai-source-pane-width', String(sourcePaneWidth)); } catch { /* Optional persistence. */ }
  }, [sourcePaneWidth]);
  useEffect(() => setSelectedResponseId(conversation.responses.at(-1)?.id ?? null), [conversation.id, conversation.responses.length]);

  const response = conversation.responses.find((item) => item.id === selectedResponseId) ?? conversation.responses.at(-1) ?? null;
  const sharedCount = conversation.responses.flatMap((item) => item.nodes).filter((node) => node.includeInModelContext && !node.deletedAt).length;
  const references = conversation.referenceConversationIds || [];

  function focusNode(nodeId: string) {
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`.node-content-editable[data-node-id="${nodeId}"]`)?.focus());
  }
  async function addNode(responseId: string, parentId: string | null) {
    const result = await window.willai.createChildNode(responseId, parentId);
    await onRefresh();
    focusNode(result.nodeId);
  }
  async function addSibling(nodeId: string, content = '') {
    const result = await window.willai.createSiblingNode(nodeId, content);
    await onRefresh();
    focusNode(result.nodeId);
  }
  async function moveNode(nodeId: string, direction: 'indent' | 'outdent' | 'up' | 'down') {
    const result = await window.willai.moveNode(nodeId, direction);
    if (!result.ok) return;
    await onRefresh();
    focusNode(nodeId);
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
  async function updateReferences(referenceId: string, enabled: boolean) {
    const next = enabled ? [...references, referenceId] : references.filter((id) => id !== referenceId);
    await window.willai.setConversationReferences(conversation.id, next);
    await onRefresh();
  }
  async function exportConversation(format: 'txt' | 'markdown' | 'html' | 'json' | 'pdf') {
    try {
      const result = await window.willai.exportConversation(conversation.id, format);
      onNotice(result.canceled ? 'Export cancelled.' : 'Conversation exported to ' + result.filePath);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Export failed.');
    }
  }
  async function setFlag(patch: {pinned?: boolean; archived?: boolean}) {
    await window.willai.setConversationFlags(conversation.id, patch);
    if (patch.archived) onBack();
    await onRefresh();
  }
  async function moveToFolder(folderId: string) {
    await window.willai.moveConversation(conversation.id, folderId || null);
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
        <div className="conversation-subtitle">{conversation.sourceUrl} <span>·</span> {conversation.responses.length} original responses <span>·</span> updated {new Date(conversation.updatedAt).toLocaleString()}</div>
        <div className="conversation-management-actions">
          <button type="button" onClick={() => void setFlag({ pinned: !conversation.pinned })}>{conversation.pinned ? '★ Pinned' : '☆ Pin'}</button>
          <button type="button" onClick={() => void setFlag({ archived: true })}>Archive</button>
          <button type="button" onClick={onOpenNotes}>Chat notes</button>
          <label>Folder
            <select value={conversation.folderId || ''} onChange={(event) => void moveToFolder(event.target.value)}>
              <option value="">Unfiled</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
          </label>
          <div className="export-actions">
            <button type="button" onClick={() => void exportConversation('markdown')}>Export MD</button>
            <button type="button" onClick={() => void exportConversation('html')}>HTML</button>
            <button type="button" onClick={() => void exportConversation('txt')}>TXT</button>
            <button type="button" onClick={() => void exportConversation('json')}>JSON</button>
            <button type="button" onClick={() => void exportConversation('pdf')}>PDF / Print</button>
          </div>
        </div>
      </div>
      <div className="conversation-actions-row">
        <button type="button" className="insert-context-button" disabled={!conversation.sharedContextPreview} onClick={() => void onInsertContext()}>Add selected context to provider composer</button>
        <span className="shared-status">{sharedCount} nodes selected as model context · {references.length} reference conversations</span>
        <button type="button" className="reference-toggle" onClick={() => setReferencesOpen((value) => !value)}>{referencesOpen ? 'Hide references' : 'Manage references'}</button>
      </div>
      {referencesOpen && (
        <section className="reference-panel">
          <div><strong>Reference conversations</strong><small>Only nodes explicitly shared with model context are included.</small></div>
          <div className="reference-list">
            {allConversations.filter((item) => item.id !== conversation.id).map((item) => (
              <label key={item.id}>
                <input type="checkbox" checked={references.includes(item.id)} onChange={(event) => void updateReferences(item.id, event.target.checked)} />
                <span>{item.title}</span><small>{item.provider}</small>
              </label>
            ))}
          </div>
        </section>
      )}
      <div className="response-workspace-scroll">
        <section className="response-navigation">
          <div className="section-eyebrow">ORIGINAL RESPONSES</div>
          <div className="response-navigation-list">
            {conversation.responses.map((item, index) => (
              <div className="response-nav-wrap" key={item.id}>
                <button type="button" className={'response-navigation-item' + (response?.id === item.id ? ' active' : '')} onClick={() => setSelectedResponseId(item.id)}>
                  <span>{item.pinned ? '★ ' : ''}Response {String(index + 1).padStart(2, '0')}</span>
                  <small>{new Date(item.capturedAt).toLocaleString()}</small>
                </button>
                <button type="button" className="response-pin-button" title={item.pinned ? 'Unpin response' : 'Pin response'} onClick={() => void window.willai.setResponsePinned(item.id, !item.pinned).then(onRefresh)}>{item.pinned ? '★' : '☆'}</button>
              </div>
            ))}
          </div>
        </section>
        {response && (
          <div className="response-editor-layout" style={{ "--source-pane-width": `${sourcePaneWidth}px` } as CSSProperties}>
            <section className="original-response-card">
              <div className="response-card-heading"><span className="section-eyebrow">SOURCE RECORD</span><span className="read-only-label">Original response · read only</span></div>
              <MarkdownContent content={response.originalContent} className="source-markdown" />
              <div className="response-export-actions">
                <button type="button" onClick={() => void window.willai.copyText(response.originalContent).then(() => onNotice('Original response copied as Markdown.'))}>Copy Markdown</button>
                <button type="button" onClick={() => void window.willai.copyText(response.originalContent.replace(/[#*_~>|-]/g, '')).then(() => onNotice('Plain text copied.'))}>Copy plain text</button>
              </div>
            </section>
            <ResizeHandle label="Resize original response and node editor" value={sourcePaneWidth} min={280} max={900} onChange={setSourcePaneWidth} />
            <section className="working-nodes-section">
              <div className="working-nodes-heading">
                <div><span className="section-eyebrow">YOUR EDITABLE CONTENT</span><h2>Node outline</h2></div>
                <button type="button" className="add-node-button" onClick={() => void addNode(response.id, null)}>＋ New node</button>
              </div>
              <div className="node-list">
                {response.nodes.filter((node) => !node.deletedAt && !node.parentId).sort((a, b) => a.position - b.position).map((node) => (
                  <NodeEditor key={node.id} node={node} allNodes={response.nodes} onSave={saveNode} onShared={setShared} onAddChild={(parentId) => addNode(response.id, parentId)} onAddSibling={addSibling} onMove={moveNode} onDelete={deleteNode} />
                ))}
                {!response.nodes.some((node) => !node.deletedAt && !node.parentId) && (
                  <div className="no-nodes">No nodes yet. Create one, press Enter for a sibling, and use Tab / Shift+Tab to structure the outline.</div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
function inlineDomToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return String(node.textContent || '').replace(/\u00a0/g, ' ');
  if (!(node instanceof HTMLElement)) return '';
  const tag = node.tagName;
  if (tag === 'BR') return '\n';
  const children = Array.from(node.childNodes).map(inlineDomToMarkdown).join('');
  if (tag === 'STRONG' || tag === 'B') return '**' + children + '**';
  if (tag === 'EM' || tag === 'I') return '*' + children + '*';
  if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') return '~~' + children + '~~';
  if (tag === 'CODE') return '`' + children.replace(/`/g, '\\`') + '`';
  if (tag === 'A') {
    const href = node.getAttribute('href');
    return href ? '[' + children + '](' + href + ')' : children;
  }
  if (tag === 'IMG') return '![' + (node.getAttribute('alt') || '') + '](' + (node.getAttribute('src') || '') + ')';
  if (tag === 'SUB') return '~' + children + '~';
  if (tag === 'SUP') return '^' + children + '^';
  return children;
}

function blockDomToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return String(node.textContent || '').trim();
  if (!(node instanceof HTMLElement)) return '';
  const tag = node.tagName;
  if (tag === 'BR') return '\n';
  if (tag === 'PRE') {
    const code = node.querySelector('code') || node;
    const language = String(code.className || '').match(/language-([a-z0-9_+#.-]+)/i)?.[1] || '';
    return '```' + language + '\n' + (code.textContent || '').replace(/\n+$/, '') + '\n```';
  }
  if (tag === 'UL' || tag === 'OL') {
    return Array.from(node.children).filter((item) => item.tagName === 'LI').map((item, index) =>
      (tag === 'OL' ? String(index + 1) + '. ' : '- ') + inlineDomToMarkdown(item),
    ).join('\n');
  }
  if (tag === 'BLOCKQUOTE') {
    const body = Array.from(node.childNodes).map(blockDomToMarkdown).filter(Boolean).join('\n');
    return body.split('\n').map((line) => line ? '> ' + line : '>').join('\n');
  }
  if (/^H[1-6]$/.test(tag)) return '#'.repeat(Number(tag.slice(1))) + ' ' + inlineDomToMarkdown(node);
  if (tag === 'HR') return '---';
  if (tag === 'P' || tag === 'DIV') {
    return Array.from(node.childNodes).map((child) =>
      child instanceof HTMLElement && ['P', 'DIV', 'UL', 'OL', 'PRE', 'BLOCKQUOTE'].includes(child.tagName)
        ? blockDomToMarkdown(child)
        : inlineDomToMarkdown(child),
    ).join('');
  }
  return inlineDomToMarkdown(node);
}

function editableContentToMarkdown(element: HTMLElement): string {
  return Array.from(element.childNodes).map(blockDomToMarkdown).filter(Boolean).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function NodeEditor({
  node, allNodes, onSave, onShared, onAddChild, onAddSibling, onMove, onDelete,
}: {
  node: WorkingNode;
  allNodes: WorkingNode[];
  onSave: (id: string, content: string) => Promise<void>;
  onShared: (id: string, enabled: boolean) => Promise<void>;
  onAddChild: (parentId: string) => Promise<void>;
  onAddSibling: (nodeId: string, content?: string) => Promise<void>;
  onMove: (nodeId: string, direction: 'indent' | 'outdent' | 'up' | 'down') => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef(node.content);
  const [collapsed, setCollapsed] = useState(false);
  const children = allNodes.filter((item) => item.parentId === node.id && !item.deletedAt).sort((a, b) => a.position - b.position);
  const rendered = useMemo(() => ({ __html: markdownRenderer.render(node.content || '') }), [node.content]);

  useEffect(() => { draftRef.current = node.content; }, [node.content]);

  async function saveDraft() {
    const latest = draftRef.current;
    if (latest !== node.content) await onSave(node.id, latest);
  }

  function rangeToMarkdown(range: Range) {
    const wrapper = document.createElement('div');
    wrapper.appendChild(range.cloneContents());
    return editableContentToMarkdown(wrapper);
  }

  async function splitNodeAtCaret(element: HTMLDivElement) {
    const selection = window.getSelection();
    const hasCaret = Boolean(selection && selection.rangeCount > 0 && element.contains(selection.getRangeAt(0).startContainer));
    if (!selection || !hasCaret) {
      const content = editableContentToMarkdown(element);
      draftRef.current = content;
      await onSave(node.id, content);
      await onAddSibling(node.id);
      return;
    }

    const caret = selection.getRangeAt(0).cloneRange();
    const beforeRange = document.createRange();
    beforeRange.selectNodeContents(element);
    beforeRange.setEnd(caret.startContainer, caret.startOffset);
    const afterRange = document.createRange();
    afterRange.selectNodeContents(element);
    afterRange.setStart(caret.startContainer, caret.startOffset);

    const before = rangeToMarkdown(beforeRange);
    const after = rangeToMarkdown(afterRange);
    draftRef.current = before;
    await onSave(node.id, before);
    await onAddSibling(node.id, after);
  }

  async function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        const content = editableContentToMarkdown(event.currentTarget);
        draftRef.current = content;
        await onSave(node.id, content);
        await onAddSibling(node.id);
      } else {
        await splitNodeAtCaret(event.currentTarget);
      }
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      await onMove(node.id, event.shiftKey ? 'outdent' : 'indent');
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      await onMove(node.id, event.key === 'ArrowUp' ? 'up' : 'down');
      return;
    }
    if ((event.metaKey || event.ctrlKey) && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      if (event.key === 'ArrowUp') {
        if (children.length) {
          event.preventDefault();
          setCollapsed(true);
        }
      } else {
        event.preventDefault();
        if (children.length) setCollapsed(false);
        else await onAddChild(node.id);
      }
      return;
    }
    if (event.key === 'Escape') event.currentTarget.blur();
  }

  const marker = node.nodeType === 'heading'
    ? 'H'
    : node.nodeType === 'list-item'
      ? (node.listOrdered ? String((node.listIndex ?? node.position) + (node.listStart || 1)) + '.' : '•')
      : '•';

  return (
    <div className={'node-entry' + (node.parentId ? ' nested' : '')} data-node-entry={node.id}>
      <div className="node-line">
        <button type="button" className={'node-disclosure' + (children.length ? ' has-children' : '')}
          onClick={() => children.length && setCollapsed((value) => !value)}
          aria-label={children.length ? (collapsed ? 'Expand child nodes' : 'Collapse child nodes') : 'Node'}
          aria-expanded={children.length ? !collapsed : undefined}
          title={children.length ? (collapsed ? 'Expand' : 'Collapse') : node.nodeType || 'Node'}>
          {children.length ? (collapsed ? '▸' : '▾') : marker}
        </button>
        <div ref={editorRef} className="node-content-editable" data-node-id={node.id}
          data-node-type={node.nodeType || 'paragraph'} contentEditable suppressContentEditableWarning
          spellCheck role="textbox" aria-multiline="true" aria-label="Working node"
          data-placeholder="Type here…" dangerouslySetInnerHTML={rendered}
          onInput={(event) => { draftRef.current = editableContentToMarkdown(event.currentTarget); }}
          onBlur={() => { void saveDraft(); }}
          onKeyDown={(event) => { void handleKeyDown(event); }} />
        <span className="node-provenance" title={node.provenance}>
          {node.provenance === 'captured' ? 'source' : node.provenance === 'human-edited' ? 'edited' : 'user'}
        </span>
        <div className="node-quick-actions">
          <button type="button" title="Add sibling node" onClick={() => void onAddSibling(node.id)}>＋</button>
          <button type="button" title="Add child node" onClick={() => void onAddChild(node.id)}>↳</button>
          <button type="button" className={node.includeInModelContext ? 'shared' : ''}
            title={node.includeInModelContext ? 'Remove from model context' : 'Include in model context'}
            onClick={() => void onShared(node.id, !node.includeInModelContext)}>{node.includeInModelContext ? '◉' : '○'}</button>
          <button type="button" className="node-delete" title="Delete node and descendants" onClick={() => void onDelete(node.id)}>×</button>
        </div>
      </div>
      {children.length > 0 && !collapsed && (
        <div className="nested-nodes">
          {children.map((child) => <NodeEditor key={child.id} node={child} allNodes={allNodes}
            onSave={onSave} onShared={onShared} onAddChild={onAddChild} onAddSibling={onAddSibling}
            onMove={onMove} onDelete={onDelete} />)}
        </div>
      )}
    </div>
  );
}
export default App;
