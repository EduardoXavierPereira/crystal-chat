export async function streamChat({ apiUrl, model, messages, onToken, onThinking, signal }) {
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model,
      messages: messages.map(({ role, content }) => ({ role, content })),
      think: true,
      stream: true
    })
  });

  if (!res.ok || !res.body) {
    throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
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
