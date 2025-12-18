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

  let memoryEditorRunning = false;
  let memoryEditorQueuedJob = null;

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

  const setStatusTemp = (suffix, { ms = 2000 } = {}) => {
    try {
      if (!els?.statusEl) return;
      const prev = (els.statusEl.textContent || '').toString();
      els.statusEl.textContent = suffix ? (prev ? `${prev} • ${suffix}` : suffix) : prev;
      window.setTimeout(() => {
        try {
          if (els?.statusEl) els.statusEl.textContent = prev;
        } catch {
          // ignore
        }
      }, Number.isFinite(ms) ? ms : 2000);
    } catch {
      // ignore
    }
  };

  const extractFirstJsonObject = (text) => {
    const raw = (text || '').toString().trim();
    if (!raw) return null;
    if (raw.length > 20000) return null;

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
    const candidate = raw.slice(start, end + 1).trim();
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  };

  const normalizeMemoryEditorActions = (obj) => {
    const out = [];
    const push = (a) => {
      if (!a || typeof a !== 'object') return;
      const type = (a.type || a.action || '').toString().trim().toLowerCase();
      if (type !== 'create' && type !== 'update' && type !== 'delete') return;
      const id = typeof a.id === 'string' ? a.id : null;
      const text = typeof a.text === 'string' ? a.text : null;
      out.push({ type, id, text });
    };

    if (!obj || typeof obj !== 'object') return out;
    if (Array.isArray(obj.actions)) {
      obj.actions.forEach(push);
      return out;
    }
    if (Array.isArray(obj.create)) {
      obj.create.forEach((x) => push({ type: 'create', text: x?.text ?? x }));
    }
    if (Array.isArray(obj.update)) {
      obj.update.forEach((x) => push({ type: 'update', id: x?.id, text: x?.text }));
    }
    if (Array.isArray(obj.delete)) {
      obj.delete.forEach((x) => push({ type: 'delete', id: x?.id ?? x }));
    }
    return out;
  };

  async function runMemoryEditorJob(job) {
    const {
      apiUrl,
      responseModel,
      embModel,
      sendMessages,
      assistantContent,
      retrieved
    } = job || {};

    if (!apiUrl || !responseModel || !embModel || !db || !streamChat || !embedText) return;
    const controller = new AbortController();

    try {
      setStatusTemp('Updating memories…', { ms: 2500 });

      const memoryEditorSystem = (
        'You are Crystal Chat\'s Memory Editor AI. Your job is to maintain long-term memories about the user.\n'
        + 'Memory is good data as long as it\'s not noise, so create as many high quality memories as possible.\n'
        + 'Keep in mind memories can\'t reference each other; they must be separated.\n\n'
        + 'You will be given the chat context (including any retrieved memories).\n'
        + 'Decide whether to CREATE new memories, UPDATE existing ones, or DELETE useless/duplicated ones.\n\n'
        + 'Create memories for stable user facts such as (non-exhaustive): name, pronouns, location/timezone, language, preferences, dislikes, ongoing projects, recurring goals, constraints, tools they use, and long-term plans.\n'
        + 'Do NOT create memories for one-off requests, transient states ("I\'m hungry"), or the assistant\'s own messages.\n'
        + 'Prefer 1 memory per fact. Keep each memory short, specific, and directly useful.\n'
        + 'If a new message refines an existing memory, UPDATE it instead of creating duplicates.\n'
        + 'If a memory is redundant, wrong, or low-value, DELETE it.\n\n'
        + 'Output ONLY a single line of JSON, no markdown, no extra text.\n'
        + 'Schema:\n'
        + '{"actions":[{"type":"create","text":"..."},{"type":"update","id":"...","text":"..."},{"type":"delete","id":"..."}]}\n'
        + 'You may also output {"create":[...],"update":[...],"delete":[...]} as an alternative.\n'
        + 'If no changes are needed, output: {"actions":[]}.\n\n'
        + 'Examples (format only; do not copy content):\n'
        + '{"actions":[{"type":"create","text":"User\'s name is Eduardo."}]}\n'
        + '{"actions":[{"type":"update","id":"<existing_id>","text":"User prefers short, bullet-point answers."}]}\n'
        + '{"actions":[{"type":"delete","id":"<duplicate_id>"}]}\n\n'
        + `Retrieved memories (for reference): ${JSON.stringify((retrieved || []).map((m) => ({ id: m?.id, text: m?.text })))}\n`
      );

      let editorOut = '';
      let editorFinal = null;
      await streamChat({
        apiUrl,
        model: responseModel,
        temperature: 0,
        messages: [
          { role: 'system', content: memoryEditorSystem },
          ...(Array.isArray(sendMessages) ? sendMessages : []),
          {
            role: 'user',
            content: `Assistant's last reply (for context):\n${(assistantContent || '').toString()}\n\nNow output the JSON memory actions.`
          }
        ],
        signal: controller.signal,
        onThinking: (t) => {
          editorOut += (t || '').toString();
        },
        onToken: (t) => {
          editorOut += (t || '').toString();
        },
        onFinal: (j) => {
          editorFinal = j;
        }
      });

      console.log('[memories] memory editor raw response', editorOut);
      console.log('[memories] memory editor final', editorFinal);

      const parsed = extractFirstJsonObject(editorOut);
      const actions = normalizeMemoryEditorActions(parsed);
      console.log('[memories] memory editor parsed', {
        hasJson: !!parsed,
        actions: actions.map((a) => ({ type: a.type, id: a.id, textLen: (a.text || '').length }))
      });

      if (!actions.length) {
        setStatusTemp('No memory changes');
        return;
      }

      const { addMemory, updateMemory, deleteMemoryById } = await import('./memories.js');
      for (const a of actions) {
        if (!a || a.type === 'delete') {
          if (a?.id) await deleteMemoryById(db, a.id);
          continue;
        }
        const text = (a.text || '').toString().trim();
        if (!text) continue;
        const emb = await embedText({ apiUrl, model: embModel, text, signal: controller.signal });
        if (a.type === 'create') {
          await addMemory(db, { text, embedding: emb, createdAt: Date.now() });
        } else if (a.type === 'update') {
          if (!a.id) continue;
          await updateMemory(db, { id: a.id, text, embedding: emb, updatedAt: Date.now() });
        }
      }

      try {
        window.dispatchEvent(new CustomEvent('cc:memoriesChanged', { detail: { reason: 'editor' } }));
      } catch {
        // ignore
      }

      setStatusTemp('Memories updated');
    } catch (e) {
      console.warn('[memories] memory editor failed', e);
      setStatusTemp('Memory editor failed');
    }
  }

  async function processMemoryEditorQueue() {
    if (memoryEditorRunning) return;
    memoryEditorRunning = true;
    try {
      while (memoryEditorQueuedJob) {
        const job = memoryEditorQueuedJob;
        memoryEditorQueuedJob = null;
        await runMemoryEditorJob(job);
      }
    } finally {
      memoryEditorRunning = false;
    }
  }

  function enqueueMemoryEditor(job) {
    // Coalesce: keep only the latest job, since newer context supersedes older.
    memoryEditorQueuedJob = job;
    void processMemoryEditorQueue();
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

    const setTypingIndicatorLabel = (text) => {
      const el = els.typingIndicator;
      if (!el) return;
      const labelEl = els.typingIndicatorLabelEl;
      if (labelEl) {
        labelEl.textContent = (text || '').toString();
        return;
      }
      try {
        const nodes = Array.from(el.childNodes || []);
        const textNode = nodes.find((n) => n && n.nodeType === Node.TEXT_NODE);
        if (textNode) {
          textNode.textContent = ` ${String(text || '')}`;
          return;
        }
      } catch {
        // ignore
      }
      try {
        el.dataset.ccLabel = (text || '').toString();
      } catch {
        // ignore
      }
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
      s += 'Instead: write a short synthesized answer.\n';
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
      const hardSys = 'Reply in the same language as the user. Do not default to Chinese unless the user wants Chinese responses.'
        + 'You have access to a vector database of long-term memories you\'ve gathered over previous chats with the user. If it\'s empty, that means you have no memories.';
      let combinedSystem = sys ? `${hardSys}\n\n${sys}` : hardSys;

      const toolBlock = toolInstructionBlock();
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

      try {
        const last = historyMessages[historyMessages.length - 1];
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
          setStatusTemp('Memory editor unavailable');
        } else {
          const retrieved = Array.isArray(assistantMsg._retrievedMemories) ? assistantMsg._retrievedMemories : [];
          enqueueMemoryEditor({
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
