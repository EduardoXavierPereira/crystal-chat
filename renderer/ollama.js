export async function streamChat({ apiUrl, model, temperature, messages, onToken, onThinking, signal }) {
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model,
      keep_alive: 0,
      options: Number.isFinite(temperature) ? { temperature } : undefined,
      messages: messages.map(({ role, content }) => ({ role, content })),
      stream: true
    })
  });

  if (!res.ok || !res.body) {
    let details = '';
    try {
      const txt = await res.text();
      if (txt) {
        try {
          const j = JSON.parse(txt);
          details = j?.error ? String(j.error) : txt;
        } catch {
          details = txt;
        }
      }
    } catch {
      // ignore
    }
    const msg = details
      ? `Ollama error: ${res.status} ${res.statusText} - ${details}`
      : `Ollama error: ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let json;
      try {
        json = JSON.parse(trimmed);
      } catch {
        buffer = trimmed + '\n' + buffer;
        continue;
      }

      if (json.error) throw new Error(json.error);
      if (json.message && json.message.thinking) {
        onThinking?.(json.message.thinking);
      }
      if (json.message && json.message.content) {
        onToken?.(json.message.content);
      }
      if (json.done) return;
    }
  }
}

function buildEmbeddingsUrl(apiUrl) {
  const u = new URL(apiUrl);
  if (u.pathname.endsWith('/api/chat')) {
    u.pathname = u.pathname.replace(/\/api\/chat$/, '/api/embeddings');
    return u.toString();
  }
  u.pathname = '/api/embeddings';
  return u.toString();
}

export async function embedText({ apiUrl, model, text, signal }) {
  const url = buildEmbeddingsUrl(apiUrl);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model,
      prompt: (text || '').toString()
    })
  });

  if (!res.ok) {
    let details = '';
    try {
      const txt = await res.text();
      if (txt) {
        try {
          const j = JSON.parse(txt);
          details = j?.error ? String(j.error) : txt;
        } catch {
          details = txt;
        }
      }
    } catch {
      // ignore
    }
    const msg = details
      ? `Ollama embeddings error: ${res.status} ${res.statusText} - ${details}`
      : `Ollama embeddings error: ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  const json = await res.json();
  const emb = json?.embedding;
  if (!Array.isArray(emb) || emb.length === 0) {
    throw new Error('Ollama embeddings error: missing embedding in response.');
  }
  return emb;
}
