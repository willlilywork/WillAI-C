const BRIDGE_ORIGIN = 'http://127.0.0.1:43821';
const tokenInput = document.getElementById('token');
const statusElement = document.getElementById('status');
const indicator = document.getElementById('indicator');

function setStatus(message, state = '') {
  statusElement.textContent = message;
  statusElement.className = `status ${state}`;
  indicator.className = `indicator ${state === 'success' ? 'ok' : state === 'error' ? 'bad' : ''}`;
}

async function storedToken() {
  const values = await chrome.storage.local.get(['willaiPairingToken']);
  return values.willaiPairingToken || '';
}

async function testConnection(token) {
  const response = await fetch(`${BRIDGE_ORIGIN}/v1/health`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not connect to WillAI-C.');
  return result;
}

document.getElementById('save').addEventListener('click', async () => {
  const token = tokenInput.value.trim();
  if (!token) return setStatus('Paste the pairing token shown in WillAI-C.', 'error');
  try {
    await chrome.storage.local.set({ willaiPairingToken: token });
    await testConnection(token);
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id) chrome.tabs.sendMessage(activeTab.id, { type: 'WILLAI_RESCAN' }, () => void chrome.runtime.lastError);
    setStatus('Connected to the WillAI-C desktop workspace.', 'success');
  } catch (error) {
    setStatus(error.message || 'Connection failed. Is the desktop app running?', 'error');
  }
});

document.getElementById('insert').addEventListener('click', async () => {
  try {
    const token = await storedToken();
    if (!token) throw new Error('Save your desktop pairing token first.');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url) throw new Error('No active browser tab was found.');

    const response = await fetch(`${BRIDGE_ORIGIN}/v1/context?sourceUrl=${encodeURIComponent(tab.url)}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not read shared context.');
    if (!result.context) throw new Error('No shared nodes are enabled for this conversation.');

    const insertion = await chrome.tabs.sendMessage(tab.id, {
      type: 'WILLAI_INSERT_CONTEXT',
      context: result.context,
    });
    if (!insertion?.ok) throw new Error(insertion?.error || 'Could not insert context on this page.');
    setStatus('Context inserted into the composer. Review it before sending.', 'success');
  } catch (error) {
    setStatus(error.message || 'Could not insert context.', 'error');
  }
});

storedToken().then((token) => {
  if (token) {
    tokenInput.value = token;
    testConnection(token)
      .then(() => setStatus('Connected to the WillAI-C desktop workspace.', 'success'))
      .catch(() => setStatus('Token saved. Start WillAI-C or check the pairing token.', 'error'));
  }
});
