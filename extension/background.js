const BRIDGE_ORIGIN = 'http://127.0.0.1:43821';
async function getPairingToken() {
  const values = await chrome.storage.local.get(['willaiPairingToken']);
  return values.willaiPairingToken || '';
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'WILLAI_CAPTURE_RESPONSE') return undefined;
  (async () => {
    const token = await getPairingToken();
    if (!token) throw new Error('Pair this extension with WillAI-C first.');
    const response = await fetch(`${BRIDGE_ORIGIN}/v1/captures`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message.payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The desktop bridge rejected this response.');
    sendResponse({ ok: true, result });
  })().catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
