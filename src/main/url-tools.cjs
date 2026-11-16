const PROVIDER_HOSTS = {
  chatgpt: new Set(['chatgpt.com', 'chat.openai.com']),
  claude: new Set(['claude.ai']),
  deepseek: new Set(['deepseek.com', 'chat.deepseek.com']),
};

function providerFromUrl(value) {
  try {
    const url = new URL(String(value));
    const host = url.hostname.toLowerCase();
    for (const [provider, hosts] of Object.entries(PROVIDER_HOSTS)) {
      if (hosts.has(host) || (provider === 'deepseek' && host.endsWith('.deepseek.com'))) return provider;
    }
    return null;
  } catch {
    return null;
  }
}

function isWebUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function navigationTarget(input) {
  const value = String(input || '').trim();
  if (!value) return 'https://chatgpt.com/';
  if (/^(javascript|data|file|vbscript):/i.test(value)) {
    throw new Error('This URL scheme is not available in browser navigation.');
  }
  if (isWebUrl(value)) return value;
  if (/^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:\/.*)?$/i.test(value) && !/\s/.test(value)) {
    return `https://${value}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}

module.exports = { PROVIDER_HOSTS, providerFromUrl, isWebUrl, navigationTarget };
