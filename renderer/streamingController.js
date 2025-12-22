import { TypingIndicatorController } from './streaming/TypingIndicatorController.js';
import { MemoryEditorController } from './streaming/MemoryEditorController.js';
import { setStatusTemp } from './streaming/utils.js';

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

  // Initialize sub-controllers
  const typingIndicator = new TypingIndicatorController(els.typingIndicator);
  const memoryEditor = new MemoryEditorController({
    els,
    state,
    getApiUrl,
    streamChat,
    embedText,
    embeddingModel,
    tempChatId,
    db,
    typingIndicator
  });

  function abort() {
    streamAbortController?.abort();
  }

  async function streamAssistant(chat) {
    state.isStreaming = true;
    els.typingIndicator?.classList.remove('hidden');
    typingIndicator.show();
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

    const setTypingIndicatorLabel = (text) => {
      typingIndicator.setLabel(text);
    };

    // Import tools registry
    const { getToolsSystemPrompt, parseToolCall, executeTool, formatToolResult } = await import('./tools/registry.js');

    const tryParseToolCall = (text) => parseToolCall(text);

    const runTool = async ({ title, arguments: args }) => {
      return await executeTool(title, args);
    };

    try {
      const sys = (state.systemPrompt || '').toString().trim();
      const hardSys = 'Reply in the same language as the user. Do not default to Chinese unless the user wants Chinese responses.'
        + 'You have access to a vector database of long-term memories you\'ve gathered over previous chats with the user. If it\'s empty, that means you have no memories.';
      let combinedSystem = sys ? `${hardSys}\n\n${sys}` : hardSys;

      const toolBlock = getToolsSystemPrompt(state);
      if (toolBlock) {
        combinedSystem = `${combinedSystem}\n\n${toolBlock}`;
      }

      const historyMessages = chat.messages.slice(0, -1).map((m) => {
        if (!m || typeof m !== 'object') return m;
        if (m.role !== 'user') return m;
        const base = (m.content || '').toString();
        const extra = (m.attachmentText || '').toString();
        if (!extra.trim()) return m;
        const combined = base.trim() ? `${base}\n\n${extra}` : extra;
        return { ...m, content: combined };
      });
      const trimmedHistory = historyMessages.slice(-2);

      try {
        const last = trimmedHistory[trimmedHistory.length - 1];
        const prompt = last && last.role === 'user' ? (last.content || '').toString() : '';
        const apiUrl = getApiUrl() || 'http://localhost:11435/api/chat';
        const embModel = (embeddingModel || '').toString().trim();
        if (prompt && embedText && embModel && db) {
          console.debug('[memories] embedding + retrieval start', { model: embModel });
          const {
            findSimilarMemoriesScored,
            renderMemoriesBlock,
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
        }
      } catch (e) {
        console.warn('[memories] embedding/retrieval failed', e);
      }

      const sendMessages = [{ role: 'system', content: combinedSystem }, ...trimmedHistory];

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
        const toolEnabled = true; // Always check for tool calls (file system tools don't need internet)
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
            const trace = `\n\n[tool:${toolCall.title}] args=${JSON.stringify(toolCall.arguments)}\n[tool:${toolCall.title}] result=${JSON.stringify(toolResult)}`;
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
          loopMessages.push({ role: 'system', content: `Tool result (${toolCall.title}): ${JSON.stringify(toolResult)}` });
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

          // Retry tool loop after Ollama recovery
          const maxToolTurns = 4;
          const toolEnabled = true;
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
              const trace = `\n\n[tool:${toolCall.title}] args=${JSON.stringify(toolCall.arguments)}\n[tool:${toolCall.title}] result=${JSON.stringify(toolResult)}`;
              assistantMsg.thinking = `${(assistantMsg.thinking || '').toString()}${trace}`;
              assistantMsg._thinkingActive = false;
              assistantMsg._thinkingOpen = true;
              assistantMsg._thinkingUserToggled = false;
              updateStreamingMessage();
            } catch {
              // ignore
            }
            loopMessages.push({ role: 'assistant', content: JSON.stringify(toolCall) });
            loopMessages.push({ role: 'system', content: `Tool result (${toolCall.title}): ${JSON.stringify(toolResult)}` });
          }
        } else {
          throw e;
        }
      }

      assistantMsg._done = true;
      renderActiveChatUI();

      try {
        const apiUrl = getApiUrl() || 'http://localhost:11435/api/chat';
        const embModel = (embeddingModel || '').toString().trim();
        const responseModel = (state.selectedModel || modelFallback).toString();
        const allowUpdate = !!state.updateMemoryEnabled && chat.id !== tempChatId;
        if (!allowUpdate) {
          console.log('[memories] memory editor skipped', {
            updateMemoryEnabled: !!state.updateMemoryEnabled,
            isTempChat: chat.id === tempChatId
          });
        } else if (!db || !embedText || !embModel || !streamChat || !responseModel) {
          console.log('[memories] memory editor prerequisites missing', {
            hasDb: !!db,
            hasEmbedText: !!embedText,
            embeddingModel: embModel,
            hasStreamChat: !!streamChat,
            responseModel
          });
          setStatusTemp(els?.statusEl, 'Memory editor unavailable');
        } else {
          const retrieved = Array.isArray(assistantMsg._retrievedMemories) ? assistantMsg._retrievedMemories : [];
          memoryEditor.enqueue({
            apiUrl,
            responseModel,
            embModel,
            sendMessages,
            assistantContent: (assistantMsg.content || '').toString(),
            retrieved
          });
        }
      } catch (e) {
        console.warn('[memories] memory editor enqueue failed', e);
      }

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
      streamAbortController = null;

      // Reset send button immediately after streaming ends
      if (els.sendBtn) {
        els.sendBtn.setAttribute('aria-label', 'Send');
        els.sendBtn.innerHTML = '<span>➤</span>';
      }

      // Hide typing indicator only if memory editor is not running
      // (memory editor will hide it when it completes)
      if (!memoryEditor.isRunning()) {
        els.typingIndicator?.classList.add('hidden');
        typingIndicator.hide();
      } else if (els.typingIndicatorLabelEl) {
        els.typingIndicatorLabelEl.textContent = 'Updating memories...';
      }
    }
  }

  return {
    streamAssistant,
    abort
  };
}
