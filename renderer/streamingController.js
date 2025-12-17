export function createStreamingController({
  els,
  state,
  getApiUrl,
  modelFallback,
  tempChatId,
  clampNumber,
  streamChat,
  embedText,
  embeddingModel,
  memoryTopK,
  memoryMaxChars,
  memoryCandidateK,
  memoryMinScore,
  memoryRetentionMs,
  updateRenderedMessage,
  renderActiveChatUI,
  renderChatsUI,
  saveChat,
  showError,
  db
}) {
  let streamAbortController = null;

  let lastMemoryPurgeTs = 0;

  let spinnerRafId = null;
  let spinnerLastTs = 0;
  let spinnerAngle = 0;

  function startTypingSpinnerFallback() {
    if (spinnerRafId) return;
    const spinnerEl = els.typingIndicator?.querySelector?.('.spinner');
    if (!spinnerEl) return;

    spinnerLastTs = 0;
    const step = (ts) => {
      if (!els.typingIndicator || els.typingIndicator.classList.contains('hidden')) {
        spinnerRafId = null;
        spinnerLastTs = 0;
        spinnerAngle = 0;
        spinnerEl.style.transform = '';
        return;
      }
      if (!spinnerLastTs) spinnerLastTs = ts;
      const dt = ts - spinnerLastTs;
      spinnerLastTs = ts;

      spinnerAngle = (spinnerAngle + (dt / 800) * 360) % 360;
      spinnerEl.style.transform = `rotate(${spinnerAngle}deg)`;
      spinnerRafId = window.requestAnimationFrame(step);
    };

    spinnerRafId = window.requestAnimationFrame(step);
  }

  function stopTypingSpinnerFallback() {
    if (spinnerRafId) {
      window.cancelAnimationFrame(spinnerRafId);
      spinnerRafId = null;
    }
    spinnerLastTs = 0;
    spinnerAngle = 0;
    const spinnerEl = els.typingIndicator?.querySelector?.('.spinner');
    if (spinnerEl) spinnerEl.style.transform = '';
  }

  function abort() {
    streamAbortController?.abort();
  }

  async function streamAssistant(chat) {
    state.isStreaming = true;
    els.typingIndicator.classList.remove('hidden');
    startTypingSpinnerFallback();
    if (els.sendBtn) {
      els.sendBtn.disabled = false;
      els.sendBtn.setAttribute('aria-label', 'Pause');
      els.sendBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
        + '<rect x="7" y="6" width="3.5" height="12" rx="1" fill="currentColor" />'
        + '<rect x="13.8" y="6" width="3.5" height="12" rx="1" fill="currentColor" />'
        + '</svg>';
    }

    streamAbortController = new AbortController();

    const assistantMsg = {
      role: 'assistant',
      content: '',
      thinking: '',
      tokens: null,
      _done: false,
      _thinkingActive: false,
      _thinkingOpen: false,
      _thinkingUserToggled: false,
      _retrievedMemories: null,
      _retrievedMemoriesOpen: false
    };

    chat.messages.push(assistantMsg);
    renderActiveChatUI();
    const assistantIndex = chat.messages.length - 1;

    let lastStreamingFullRenderTs = 0;

    const updateStreamingMessage = () => {
      const ok = updateRenderedMessage({ els, msg: assistantMsg, messageIndex: assistantIndex });
      if (ok) return;
      const now = Date.now();
      if (now - lastStreamingFullRenderTs < 250) return;
      lastStreamingFullRenderTs = now;
      renderActiveChatUI();
    };

    const toolInstructionBlock = () => {
      const enabled = {
        web_search: !!state.enableInternet,
        open_link: !!state.enableInternet
      };
      if (!enabled.web_search && !enabled.open_link) return '';

      let s = '';
      s += 'You MAY call tools if (and only if) the user enabled them in the UI.\n';
      s += 'When calling a tool, respond with ONLY a single line of JSON (no markdown, no extra text).\n';
      s += 'Tool call format:\n';
      s += '{"tool":"web_search","args":{"query":"..."}}\n';
      s += '{"tool":"open_link","args":{"url":"https://..."}}\n';
      s += 'After a tool result is provided, you will be called again and should either call another tool (same JSON format) or respond normally.\n';
      s += 'When you respond normally after tools, DO NOT dump raw tool JSON or a bare link list.\n';
      s += 'Instead: write a short synthesized answer, then include a Sources section with numbered citations that map to the search results URLs.\n';
      s += 'If the user asked for recent/news-style info, summarize the main themes and list the most relevant sources; only open_link if you need details from a specific source.\n';
      s += 'Citations format example: "Sources: [1] Title - https://..." and refer inline like "... (see [1])".\n';
      s += 'Rules:\n';
      s += '- Only call tools that are enabled when they\'re useful.\n';
      s += '- Keep queries concise.\n';
      s += 'Enabled tools:\n';
      if (enabled.web_search) s += '- web_search(query)\n';
      if (enabled.open_link) s += '- open_link(url)\n';
      return s.trim();
    };

    const tryParseToolCall = (text) => {
      const rawAll = (text || '').toString();
      const raw = rawAll.trim();
      if (!raw) return null;
      if (raw.length > 8000) return null;

      // Be tolerant: some models may output JSON plus extra text.
      // Extract the first JSON object by finding the first balanced {...} block.
      const start = raw.indexOf('{');
      if (start < 0) return null;
      let depth = 0;
      let end = -1;
      for (let i = start; i < raw.length; i += 1) {
        const ch = raw[i];
        if (ch === '{') depth += 1;
        if (ch === '}') {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end < 0) return null;

      const jsonCandidate = raw.slice(start, end + 1).trim();
      if (!jsonCandidate.startsWith('{') || !jsonCandidate.endsWith('}')) return null;

      let j;
      try {
        j = JSON.parse(jsonCandidate);
      } catch {
        return null;
      }
      const tool = j?.tool;
      const args = j?.args;
      if (tool !== 'web_search' && tool !== 'open_link') return null;
      if (typeof args !== 'object' || !args) return null;
      return { tool, args };
    };

    const runTool = async ({ tool, args }) => {
      const api = window.electronAPI;
      if (!api) throw new Error('Tools unavailable.');
      if (tool === 'web_search') {
        if (!state.enableInternet) throw new Error('Internet access is disabled.');
        const query = (args.query || '').toString();
        return await api.webSearch(query);
      }
      if (tool === 'open_link') {
        if (!state.enableInternet) throw new Error('Internet access is disabled.');
        const url = (args.url || '').toString();
        return await api.openLink(url);
      }
      throw new Error('Unknown tool.');
    };

    try {
      const sys = (state.systemPrompt || '').toString().trim();
      const hardSys = 'Reply in the same language as the user. Do not default to Chinese unless the user wants Chinese responses.';
      let combinedSystem = sys ? `${hardSys}\n\n${sys}` : hardSys;

      const toolBlock = toolInstructionBlock();
      if (toolBlock) {
        combinedSystem = `${combinedSystem}\n\n${toolBlock}`;
      }

      const historyMessages = chat.messages.slice(0, -1);

      try {
        const last = historyMessages[historyMessages.length - 1];
        const prompt = last && last.role === 'user' ? (last.content || '').toString() : '';
        const apiUrl = getApiUrl() || 'http://localhost:11435/api/chat';
        const embModel = (embeddingModel || '').toString().trim();
        if (prompt && embedText && embModel && db) {
          console.debug('[memories] embedding + retrieval start', { model: embModel });
          const {
            formatUserPromptMemory,
            findSimilarMemoriesScored,
            renderMemoriesBlock,
            addMemory,
            touchMemoriesRetrieved,
            purgeStaleMemories
          } = await import('./memories.js');

          const queryEmbedding = await embedText({ apiUrl, model: embModel, text: prompt, signal: streamAbortController.signal });
          console.debug('[memories] embedded prompt', { dims: Array.isArray(queryEmbedding) ? queryEmbedding.length : 0 });

          const candidateK = Number.isFinite(memoryCandidateK) ? memoryCandidateK : 80;
          const minScore = Number.isFinite(memoryMinScore) ? memoryMinScore : 0.25;
          const topK = Number.isFinite(memoryTopK) ? memoryTopK : 6;

          const scoredCandidates = await findSimilarMemoriesScored(db, {
            queryEmbedding,
            topK: candidateK,
            minScore
          });
          const candidates = scoredCandidates.map((x) => x.memory).slice(0, Math.max(0, topK));
          console.debug('[memories] retrieved candidates', {
            count: candidates.length,
            candidateK,
            topK,
            minScore
          });

          const budget = Number.isFinite(memoryMaxChars) ? memoryMaxChars : 2000;
          const rendered = renderMemoriesBlock(candidates, { maxChars: budget });
          console.debug('[memories] selected within budget', { count: rendered.count, usedChars: rendered.usedChars, budget });
          if (rendered.block) {
            combinedSystem = `${combinedSystem}\n\n${rendered.block}`;
          }

          assistantMsg._retrievedMemories = Array.isArray(rendered.memories) ? rendered.memories : [];

          try {
            const retrievedIds = (assistantMsg._retrievedMemories || []).map((m) => m?.id).filter(Boolean);
            await touchMemoriesRetrieved(db, retrievedIds, Date.now());
          } catch {
            // ignore
          }

          try {
            const keepMs = Number.isFinite(memoryRetentionMs) ? memoryRetentionMs : (30 * 24 * 60 * 60 * 1000);
            const now = Date.now();
            if (keepMs > 0 && now - lastMemoryPurgeTs > 6 * 60 * 60 * 1000) {
              lastMemoryPurgeTs = now;
              const res = await purgeStaleMemories(db, { retentionMs: keepMs, now });
              if ((res?.deleted || 0) > 0) {
                console.debug('[memories] purged stale memories', { deleted: res.deleted, keepMs });
                try {
                  window.dispatchEvent(new CustomEvent('cc:memoriesChanged', { detail: { reason: 'purge' } }));
                } catch {
                  // ignore
                }
              }
            }
          } catch {
            // ignore
          }

          if (chat.id !== tempChatId) {
            const memoryText = formatUserPromptMemory({ prompt, now: Date.now() });
            await addMemory(db, { text: memoryText, embedding: queryEmbedding, createdAt: Date.now() });
            console.debug('[memories] stored prompt memory');
            try {
              window.dispatchEvent(new CustomEvent('cc:memoriesChanged', { detail: { reason: 'auto-add' } }));
            } catch {
              // ignore
            }
          } else {
            console.debug('[memories] skipped saving prompt memory (temporary chat)');
          }
        }
      } catch (e) {
        console.warn('[memories] embedding/retrieval failed', e);
      }

      const sendMessages = [{ role: 'system', content: combinedSystem }, ...historyMessages];

      const isTransientOllamaLoadError = (message) => {
        const m = (message || '').toString();
        return /do load request/i.test(m) && /\bEOF\b/i.test(m);
      };

      const runStreamOnce = async (messages) => {
        assistantMsg.thinking = '';
        assistantMsg.content = '';
        assistantMsg._done = false;
        assistantMsg._thinkingActive = false;
        assistantMsg._thinkingOpen = false;
        assistantMsg._thinkingUserToggled = false;
        updateStreamingMessage();

        let finalJsonLocal = null;
        await streamChat({
          apiUrl: getApiUrl() || 'http://localhost:11435/api/chat',
          model: (state.selectedModel || modelFallback).toString(),
          temperature: clampNumber(state.creativity, 0, 2, 1),
          messages,
          signal: streamAbortController.signal,
          onThinking: (token) => {
            if (!assistantMsg._thinkingActive) {
              assistantMsg._thinkingActive = true;
              assistantMsg._thinkingOpen = true;
              assistantMsg._thinkingUserToggled = false;
            }
            assistantMsg.thinking += token;
            updateStreamingMessage();
          },
          onToken: (token) => {
            if (assistantMsg._thinkingActive) {
              assistantMsg._thinkingActive = false;
              if (!assistantMsg._thinkingUserToggled) {
                assistantMsg._thinkingOpen = false;
              }
            }
            assistantMsg.content += token;
            updateStreamingMessage();
          },
          onFinal: (finalJson) => {
            finalJsonLocal = finalJson;
            const promptEval = Number.isFinite(finalJson?.prompt_eval_count) ? finalJson.prompt_eval_count : null;
            const evalCount = Number.isFinite(finalJson?.eval_count) ? finalJson.eval_count : null;
            if (promptEval !== null || evalCount !== null) {
              assistantMsg.tokens = {
                prompt: promptEval,
                completion: evalCount,
                total: (promptEval || 0) + (evalCount || 0)
              };
            }
          }
        });
        return finalJsonLocal;
      };

      try {
        // Tool-call loop: allow a few tool calls per user message.
        const maxToolTurns = 4;
        const toolEnabled = !!state.enableInternet;
        const loopMessages = [...sendMessages];
        let toolTurns = 0;

        while (true) {
          await runStreamOnce(loopMessages);

          if (!toolEnabled) break;

          const toolCall = tryParseToolCall(assistantMsg.content);
          if (!toolCall) break;
          if (toolTurns >= maxToolTurns) break;
          toolTurns += 1;

          const toolResult = await runTool(toolCall);
          try {
            const trace = `\n\n[tool:${toolCall.tool}] args=${JSON.stringify(toolCall.args)}\n[tool:${toolCall.tool}] result=${JSON.stringify(toolResult)}`;
            assistantMsg.thinking = `${(assistantMsg.thinking || '').toString()}${trace}`;
            assistantMsg._thinkingActive = false;
            assistantMsg._thinkingOpen = true;
            assistantMsg._thinkingUserToggled = false;
            updateStreamingMessage();
          } catch {
            // ignore
          }
          // Record the tool call + result as synthetic messages.
          loopMessages.push({ role: 'assistant', content: JSON.stringify(toolCall) });
          loopMessages.push({ role: 'system', content: `Tool result (${toolCall.tool}): ${JSON.stringify(toolResult)}` });
        }
      } catch (e) {
        if (isTransientOllamaLoadError(e?.message) && !streamAbortController?.signal?.aborted) {
          const api = window.electronAPI;
          try {
            await api?.ollamaEnsureServer?.();
          } catch {
            // ignore
          }
          await new Promise((r) => setTimeout(r, 400));

          const maxToolTurns = 4;
          const toolEnabled = !!state.enableInternet;
          const loopMessages = [...sendMessages];
          let toolTurns = 0;
          while (true) {
            await runStreamOnce(loopMessages);
            if (!toolEnabled) break;
            const toolCall = tryParseToolCall(assistantMsg.content);
            if (!toolCall) break;
            if (toolTurns >= maxToolTurns) break;
            toolTurns += 1;
            const toolResult = await runTool(toolCall);
            try {
              const trace = `\n\n[tool:${toolCall.tool}] args=${JSON.stringify(toolCall.args)}\n[tool:${toolCall.tool}] result=${JSON.stringify(toolResult)}`;
              assistantMsg.thinking = `${(assistantMsg.thinking || '').toString()}${trace}`;
              assistantMsg._thinkingActive = false;
              assistantMsg._thinkingOpen = true;
              assistantMsg._thinkingUserToggled = false;
              updateStreamingMessage();
            } catch {
              // ignore
            }
            loopMessages.push({ role: 'assistant', content: JSON.stringify(toolCall) });
            loopMessages.push({ role: 'system', content: `Tool result (${toolCall.tool}): ${JSON.stringify(toolResult)}` });
          }
        } else {
          throw e;
        }
      }

      assistantMsg._done = true;
      renderActiveChatUI();
      if (chat.id !== tempChatId) {
        await saveChat(db, chat);
        renderChatsUI();
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        // user paused
        assistantMsg._done = true;
        if (assistantMsg._thinkingActive) {
          assistantMsg._thinkingActive = false;
          if (!assistantMsg._thinkingUserToggled) {
            assistantMsg._thinkingOpen = false;
          }
        }
        renderActiveChatUI();
        if (chat.id !== tempChatId) {
          try {
            await saveChat(db, chat);
            renderChatsUI();
          } catch {
            // ignore
          }
        }
      } else {
        const details = (err && (err.stack || err.message)) ? String(err.stack || err.message) : '';
        showError(els.errorEl, details || 'Failed to reach Ollama.');
        chat.messages.pop();
        if (chat.id !== tempChatId) {
          await saveChat(db, chat);
        }
        renderActiveChatUI();
      }
    } finally {
      state.isStreaming = false;
      els.typingIndicator.classList.add('hidden');
      stopTypingSpinnerFallback();
      streamAbortController = null;
      if (els.sendBtn) {
        els.sendBtn.setAttribute('aria-label', 'Send');
        els.sendBtn.innerHTML = '<span>➤</span>';
      }
    }
  }

  return {
    streamAssistant,
    abort
  };
}
