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
  updateRenderedMessage,
  renderActiveChatUI,
  renderChatsUI,
  saveChat,
  showError,
  db
}) {
  let streamAbortController = null;

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
      _done: false,
      _thinkingActive: false,
      _thinkingOpen: false,
      _thinkingUserToggled: false
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

    try {
      const sys = (state.systemPrompt || '').toString().trim();
      const hardSys = 'Reply in the same language as the user. Do not default to Chinese unless the user wants Chinese responses.';
      let combinedSystem = sys ? `${hardSys}\n\n${sys}` : hardSys;

      const historyMessages = chat.messages.slice(0, -1);

      try {
        const last = historyMessages[historyMessages.length - 1];
        const prompt = last && last.role === 'user' ? (last.content || '').toString() : '';
        const apiUrl = getApiUrl() || 'http://localhost:11435/api/chat';
        const embModel = (embeddingModel || '').toString().trim();
        if (prompt && embedText && embModel && db) {
          console.debug('[memories] embedding + retrieval start', { model: embModel });
          const { formatUserPromptMemory, findSimilarMemories, renderMemoriesBlock, addMemory } = await import('./memories.js');

          const queryEmbedding = await embedText({ apiUrl, model: embModel, text: prompt, signal: streamAbortController.signal });
          console.debug('[memories] embedded prompt', { dims: Array.isArray(queryEmbedding) ? queryEmbedding.length : 0 });

          const candidates = await findSimilarMemories(db, {
            queryEmbedding,
            topK: Number.isFinite(memoryCandidateK) ? memoryCandidateK : 80
          });
          console.debug('[memories] retrieved candidates', { count: candidates.length });

          const budget = Number.isFinite(memoryMaxChars) ? memoryMaxChars : 2000;
          const rendered = renderMemoriesBlock(candidates, { maxChars: budget });
          console.debug('[memories] selected within budget', { count: rendered.count, usedChars: rendered.usedChars, budget });
          if (rendered.block) {
            combinedSystem = `${combinedSystem}\n\n${rendered.block}`;
          }

          if (chat.id !== tempChatId) {
            const memoryText = formatUserPromptMemory({ prompt, now: Date.now() });
            await addMemory(db, { text: memoryText, embedding: queryEmbedding, createdAt: Date.now() });
            console.debug('[memories] stored prompt memory');
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

      const runStream = async () => {
        await streamChat({
          apiUrl: getApiUrl() || 'http://localhost:11435/api/chat',
          model: (state.selectedModel || modelFallback).toString(),
          temperature: clampNumber(state.creativity, 0, 2, 1),
          messages: sendMessages,
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
          }
        });
      };

      try {
        await runStream();
      } catch (e) {
        if (isTransientOllamaLoadError(e?.message) && !streamAbortController?.signal?.aborted) {
          const api = window.electronAPI;
          try {
            await api?.ollamaEnsureServer?.();
          } catch {
            // ignore
          }
          await new Promise((r) => setTimeout(r, 400));
          await runStream();
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
      } else {
        showError(els.errorEl, err.message || 'Failed to reach Ollama.');
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
