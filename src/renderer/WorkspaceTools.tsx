import { useMemo, useState } from 'react';

type ToolMode = 'prompts' | 'notes' | 'library';

type Props = {
  mode: ToolMode;
  snapshot: WillAISnapshot;
  activeConversation: Conversation | null;
  activeTab: BrowserTab | null;
  onRefresh: () => Promise<void>;
  onNotice: (message: string) => void;
};

export default function WorkspaceTools({
  mode,
  snapshot,
  activeConversation,
  activeTab,
  onRefresh,
  onNotice,
}: Props) {
  if (mode === 'prompts') {
    return <PromptManager snapshot={snapshot} onNotice={onNotice} onRefresh={onRefresh} />;
  }
  if (mode === 'notes') {
    return <NotesWorkspace snapshot={snapshot} activeConversation={activeConversation} onRefresh={onRefresh} />;
  }
  return <BrowserLibrary snapshot={snapshot} activeTab={activeTab} onNotice={onNotice} onRefresh={onRefresh} />;
}

function PromptManager({
  snapshot,
  onNotice,
  onRefresh,
}: {
  snapshot: WillAISnapshot;
  onNotice: (message: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('General');
  const [kind, setKind] = useState<'prompt' | 'chain'>('prompt');

  const prompts = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return snapshot.prompts;
    return snapshot.prompts.filter((prompt) =>
      prompt.title.toLowerCase().includes(term)
      || prompt.content.toLowerCase().includes(term)
      || prompt.category.toLowerCase().includes(term)
      || prompt.tags.some((tag) => tag.toLowerCase().includes(term)),
    );
  }, [snapshot.prompts, query]);

  function resetEditor() {
    setEditingId(null);
    setTitle('');
    setContent('');
    setCategory('General');
    setKind('prompt');
  }

  function editPrompt(prompt: WorkspacePrompt) {
    setEditingId(prompt.id);
    setTitle(prompt.title);
    setContent(prompt.content);
    setCategory(prompt.category || 'General');
    setKind(prompt.kind || 'prompt');
  }

  async function savePrompt() {
    try {
      await window.willai.savePrompt({
        id: editingId || undefined,
        title,
        content,
        category,
        kind,
        steps: kind === 'chain' ? content.split(/\n{2,}/).map((step) => step.trim()).filter(Boolean) : [],
      });
      resetEditor();
      onNotice('Prompt saved to your local library.');
      onRefreshSoon();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not save this prompt.');
    }
  }

  async function onRefreshSoon() {
    await onRefresh();
  }

  async function usePrompt(prompt: WorkspacePrompt) {
    const variables = [...new Set([...prompt.content.matchAll(/\{\{([a-zA-Z0-9_-]+)\}\}/g)].map((match) => match[1]))];
    const values: Record<string, string> = {};
    for (const variable of variables) {
      const value = window.prompt('Value for {{' + variable + '}}');
      if (value === null) return;
      values[variable] = value;
    }
    try {
      const result = await window.willai.expandPrompt(prompt.id, values);
      const inserted = await window.willai.insertPrompt(result.content);
      if (!inserted.ok) {
        onNotice(inserted.error || 'Open an AI provider before inserting a prompt.');
        return;
      }
      onNotice('Prompt inserted into the active provider composer. Review it before sending.');
      await onRefreshSoon();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not use this prompt.');
    }
  }

  async function queuePrompt(prompt: WorkspacePrompt) {
    try {
      await window.willai.enqueuePrompt(prompt.content, prompt.title);
      onNotice('Prompt added to the local queue.');
      await onRefreshSoon();
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Could not queue this prompt.');
    }
  }

  async function useQueued(item: PromptQueueItem) {
    const inserted = await window.willai.insertPrompt(item.content);
    if (!inserted.ok) {
      onNotice(inserted.error || 'Open an AI provider before inserting a queued prompt.');
      return;
    }
    await window.willai.removePromptQueueItem(item.id);
    onNotice('Queued prompt inserted. Send it in the provider, then choose the next item.');
    await onRefreshSoon();
  }

  return (
    <div className="tools-workspace">
      <div className="tools-header">
        <div>
          <div className="section-eyebrow">LOCAL WORKSPACE LIBRARY</div>
          <h1>Prompt Manager</h1>
          <p>Save reusable prompts, use variables, organize favourites, and retain a local history of inserted prompts.</p>
        </div>
        <div className="tools-header-actions">
          <button type="button" onClick={() => void window.willai.importPrompts().then(async (result) => { onNotice(result.canceled ? 'Import cancelled.' : result.imported + ' prompts imported.'); if (!result.canceled) await onRefresh(); }).catch((error) => onNotice(String(error)))}>Import JSON</button>
          <button type="button" onClick={() => void window.willai.exportPrompts().then((result) => onNotice(result.canceled ? 'Export cancelled.' : 'Prompt library exported.')).catch((error) => onNotice(String(error)))}>Export JSON</button>
        </div>
      </div>

      <div className="tools-grid">
        <section className="tool-panel prompt-library">
          <div className="tool-panel-heading">
            <h2>Saved prompts</h2>
            <button type="button" onClick={resetEditor}>＋ New</button>
          </div>
          <label className="tool-search">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search prompt library" />
          </label>
          <div className="tool-list">
            {prompts.map((prompt) => (
              <article className={'tool-list-card' + (prompt.id === editingId ? ' selected' : '')} key={prompt.id}>
                <div className="tool-list-card-main">
                  <button type="button" className="tool-list-title" onClick={() => editPrompt(prompt)}>{prompt.favorite ? '★ ' : ''}{prompt.title}</button>
                  <small>{prompt.category} · {prompt.usageCount} uses{prompt.kind === 'chain' ? ' · chain' : ''}</small>
                  <p>{prompt.content.slice(0, 150)}{prompt.content.length > 150 ? '…' : ''}</p>
                </div>
                <div className="tool-list-actions">
                  <button type="button" onClick={() => void usePrompt(prompt)}>Insert</button>
                  <button type="button" onClick={() => void queuePrompt(prompt)}>Queue</button>
                  <button type="button" onClick={() => void window.willai.setPromptFavorite(prompt.id, !prompt.favorite).then(onRefreshSoon)}>☆</button>
                  <button type="button" onClick={() => {
                    if (window.confirm('Delete this saved prompt?')) void window.willai.deletePrompt(prompt.id).then(() => {
                      if (editingId === prompt.id) resetEditor();
                      onNotice('Prompt deleted.');
                      onRefreshSoon();
                    });
                  }}>Delete</button>
                </div>
              </article>
            ))}
            {!prompts.length && <div className="tool-empty">No saved prompts match this search.</div>}
          </div>
        </section>

        <section className="tool-panel prompt-editor">
          <div className="tool-panel-heading"><h2>{editingId ? 'Edit prompt' : 'New prompt'}</h2></div>
          <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Technical review" /></label>
          <div className="tool-form-row">
            <label>Category<input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="General" /></label>
            <label>Type<select value={kind} onChange={(event) => setKind(event.target.value as 'prompt' | 'chain')}><option value="prompt">Prompt</option><option value="chain">Prompt chain</option></select></label>
          </div>
          <label>Prompt content<textarea value={content} onChange={(event) => setContent(event.target.value)} rows={12} placeholder={'Write your reusable prompt here.\n\nUse {{topic}} for variables.'} /></label>
          <div className="variable-hint">Variables use double curly braces, for example <code>{'{{topic}}'}</code>. Chain steps are stored as paragraphs separated by blank lines.</div>
          <div className="tool-editor-actions">
            <button type="button" onClick={resetEditor}>Clear</button>
            <button type="button" className="primary-tool-button" disabled={!title.trim() || !content.trim()} onClick={() => void savePrompt()}>Save prompt</button>
          </div>
          {snapshot.promptHistory.length > 0 && (
            <div className="prompt-history">
              <div className="tool-panel-heading"><h2>Recent prompt history</h2><small>Stored locally</small></div>
              {snapshot.promptHistory.slice(0, 8).map((item) => (
                <button type="button" key={item.id} className="history-item" onClick={() => {
                  setTitle(item.promptTitle === 'Manual prompt' ? '' : item.promptTitle);
                  setContent(item.content);
                  setEditingId(null);
                  onNotice('Prompt history loaded into the editor.');
                }}>
                  <span>{item.content.slice(0, 100)}{item.content.length > 100 ? '…' : ''}</span>
                  <small>{new Date(item.usedAt).toLocaleString()}</small>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="tool-panel queue-panel">
        <div className="tool-panel-heading">
          <div><h2>Prompt Queue</h2><small>Queued locally; insert each item when you are ready to send it.</small></div>
          <span className="section-count">{snapshot.promptQueue.length} queued</span>
        </div>
        {snapshot.promptQueue.length ? snapshot.promptQueue.map((item, index) => (
          <div className="queue-item" key={item.id}>
            <strong>{index + 1}. {item.title}</strong>
            <span>{item.content.slice(0, 150)}</span>
            <div><button type="button" onClick={() => void useQueued(item)}>Insert next</button><button type="button" onClick={() => void window.willai.removePromptQueueItem(item.id).then(onRefreshSoon)}>Remove</button></div>
          </div>
        )) : <div className="tool-empty">Your prompt queue is empty.</div>}
      </section>
    </div>
  );
}

function NotesWorkspace({
  snapshot,
  activeConversation,
  onRefresh,
}: {
  snapshot: WillAISnapshot;
  activeConversation: Conversation | null;
  onRefresh: () => Promise<void>;
}) {
  const [scope, setScope] = useState<'global' | 'conversation'>('global');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const visibleNotes = snapshot.notes.filter((note) => scope === 'global'
    ? !note.conversationId
    : note.conversationId === activeConversation?.id);

  function selectNote(note: WorkspaceNote) {
    setSelectedId(note.id);
    setTitle(note.title);
    setContent(note.content);
  }

  function reset() {
    setSelectedId(null);
    setTitle('');
    setContent('');
  }

  async function save() {
    if (scope === 'conversation' && !activeConversation) {
      window.alert('Open a conversation before creating a chat note.');
      return;
    }
    await window.willai.saveNote({
      id: selectedId || undefined,
      title,
      content,
      conversationId: scope === 'conversation' ? activeConversation?.id || null : null,
    });
    reset();
    await onRefresh();
  }

  return (
    <div className="tools-workspace">
      <div className="tools-header">
        <div><div className="section-eyebrow">LOCAL KNOWLEDGE CONTEXT</div><h1>Notes</h1><p>Keep workspace-wide notes or notes attached to a specific conversation.</p></div>
      </div>
      <div className="notes-toolbar">
        <div className="notes-scope">
          <button type="button" className={scope === 'global' ? 'active' : ''} onClick={() => { setScope('global'); reset(); }}>Global notes</button>
          <button type="button" className={scope === 'conversation' ? 'active' : ''} onClick={() => { setScope('conversation'); reset(); }}>Current chat notes</button>
        </div>
        {scope === 'conversation' && <span>{activeConversation?.title || 'No conversation selected'}</span>}
      </div>
      <div className="notes-layout">
        <section className="tool-panel notes-list">
          <div className="tool-panel-heading"><h2>{scope === 'global' ? 'All global notes' : 'Notes for this chat'}</h2><button type="button" onClick={reset}>＋ New note</button></div>
          {visibleNotes.map((note) => (
            <button type="button" key={note.id} className={'note-list-item' + (note.id === selectedId ? ' selected' : '')} onClick={() => selectNote(note)}>
              <strong>{note.pinned ? '★ ' : ''}{note.title}</strong><small>{new Date(note.updatedAt).toLocaleString()}</small><span>{note.content.slice(0, 120)}</span>
            </button>
          ))}
          {!visibleNotes.length && <div className="tool-empty">No notes in this section yet.</div>}
        </section>
        <section className="tool-panel note-editor">
          <div className="tool-panel-heading"><h2>{selectedId ? 'Edit note' : 'New note'}</h2></div>
          <label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Note title" /></label>
          <label>Content<textarea value={content} onChange={(event) => setContent(event.target.value)} rows={16} placeholder="Write a note…" /></label>
          <div className="tool-editor-actions">
            {selectedId && <button type="button" onClick={() => {
              if (window.confirm('Delete this note?')) void window.willai.deleteNote(selectedId).then(() => { reset(); void onRefresh(); });
            }}>Delete note</button>}
            <button type="button" className="primary-tool-button" disabled={!content.trim()} onClick={() => void save()}>Save note</button>
          </div>
        </section>
      </div>
    </div>
  );
}

function BrowserLibrary({
  snapshot,
  activeTab,
  onNotice,
  onRefresh,
}: {
  snapshot: WillAISnapshot;
  activeTab: BrowserTab | null;
  onNotice: (message: string) => void;
  onRefresh: () => Promise<void>;
}) {
  async function addCurrentBookmark() {
    if (!activeTab?.url) {
      onNotice('There is no active page to bookmark.');
      return;
    }
    const result = await window.willai.addBookmark({ name: activeTab.title, url: activeTab.url });
    onNotice(result.created ? 'Bookmark saved.' : 'This page is already bookmarked.');
    await onRefresh();
  }

  return (
    <div className="tools-workspace">
      <div className="tools-header">
        <div><div className="section-eyebrow">INTEGRATED CHROMIUM</div><h1>Bookmarks and History</h1><p>Web destinations are saved locally in the WillAI-C profile.</p></div>
        <button type="button" className="primary-tool-button" onClick={() => void addCurrentBookmark()}>＋ Bookmark current page</button>
      </div>
      <div className="tools-grid">
        <section className="tool-panel">
          <div className="tool-panel-heading"><h2>Bookmarks</h2><span className="section-count">{snapshot.bookmarks.length}</span></div>
          {snapshot.bookmarks.map((bookmark) => (
            <div className="library-row" key={bookmark.id}>
              <button type="button" onClick={() => void window.willai.navigate(bookmark.url)}><strong>{bookmark.name}</strong><small>{bookmark.url}</small></button>
              <button type="button" onClick={() => void window.willai.deleteBookmark(bookmark.id).then(async () => { onNotice('Bookmark removed.'); await onRefresh(); })}>×</button>
            </div>
          ))}
          {!snapshot.bookmarks.length && <div className="tool-empty">No bookmarks saved.</div>}
        </section>
        <section className="tool-panel">
          <div className="tool-panel-heading"><h2>Recent history</h2><span className="section-count">{snapshot.browserHistory.length}</span></div>
          {snapshot.browserHistory.slice(0, 100).map((item) => (
            <button type="button" className="library-history-row" key={item.id} onClick={() => void window.willai.navigate(item.url)}>
              <strong>{item.title}</strong><small>{item.url}</small><time>{new Date(item.visitedAt).toLocaleString()}</time>
            </button>
          ))}
          {!snapshot.browserHistory.length && <div className="tool-empty">Browsing history will appear here.</div>}
        </section>
      </div>
    </div>
  );
}
