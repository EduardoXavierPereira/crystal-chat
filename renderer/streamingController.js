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
  let memoryEditorAbortController = null;
  let memoryEditorThinking = '';
  let memoryEditorThinkingOpen = false;

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

  const updateMemoryEditorUI = ({ active = false, thinking = null } = {}) => {
    try {
      const panel = els.memoryEditorPanelEl;
      const toggle = els.memoryEditorThinkingToggleEl;
      const thinkingEl = els.memoryEditorThinkingEl;
      if (!panel || !toggle || !thinkingEl) return;

      if (thinking !== null && typeof thinking === 'string') {
        thinkingEl.textContent = thinking;
      }

      panel.classList.toggle('hidden', !active);
      thinkingEl.classList.toggle('hidden', !memoryEditorThinkingOpen);
      toggle.classList.toggle('open', !!memoryEditorThinkingOpen);
      toggle.setAttribute('aria-expanded', memoryEditorThinkingOpen ? 'true' : 'false');
    } catch {
      // ignore
    }
  };

  const ensureMemoryEditorUIBindings = (() => {
    let wired = false;
    return () => {
      if (wired) return;
      wired = true;
      try {
        const toggle = els.memoryEditorThinkingToggleEl;
        const thinkingEl = els.memoryEditorThinkingEl;
        if (toggle && thinkingEl) {
          toggle.addEventListener('click', () => {
            memoryEditorThinkingOpen = !memoryEditorThinkingOpen;
            updateMemoryEditorUI({ active: memoryEditorRunning });
          });
        }
      } catch {
        // ignore
      }
      try {
        const skipBtn = els.memoryEditorSkipBtn;
        if (skipBtn) {
          skipBtn.addEventListener('click', () => {
            if (memoryEditorAbortController) {
              try {
                memoryEditorAbortController.abort();
              } catch {
                // ignore
              }
            }
            memoryEditorQueuedJob = null;
            memoryEditorRunning = false;
            memoryEditorAbortController = null;
            setStatusTemp('Memory editor skipped');
            updateMemoryEditorUI({ active: false, thinking: '' });
            // Hide typing indicator if no other work.
            try {
              if (!state.isStreaming) {
                els.typingIndicator.classList.add('hidden');
                stopTypingSpinnerFallback();
              }
            } catch {
              // ignore
            }
          });
        }
      } catch {
        // ignore
      }
    };
  })();

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
      const match =
        typeof a.match === 'string'
          ? a.match
          : typeof a.memory === 'string'
            ? a.memory
            : typeof a.target === 'string'
              ? a.target
              : null;

      if (type === 'create') {
        out.push({ type, id, text, match: null });
        return;
      }

      // For update/delete allow the model to reference memories by human-readable text.
      const matchText = match || (type === 'delete' ? text : null);
      out.push({ type, id, text: type === 'update' ? text : null, match: matchText });
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
      obj.update.forEach((x) =>
        push({
          type: 'update',
          id: x?.id,
          text: x?.text,
          match: x?.match ?? x?.memory ?? x?.target ?? x?.existing
        })
      );
    }
    if (Array.isArray(obj.delete)) {
      obj.delete.forEach((x) =>
        push({
          type: 'delete',
          id: x?.id ?? x,
          match: x?.match ?? x?.memory ?? x?.target ?? (typeof x === 'string' ? x : null)
        })
      );
    }
    return out;
  };

  const normalizeForMemoryMatch = (s) => (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');

  const findMemoryIdByText = (text, retrieved) => {
    const targetNorm = normalizeForMemoryMatch(text);
    if (!targetNorm) return null;

    const tokens = targetNorm.split(' ').filter(Boolean);
    const tokenCount = tokens.length || 1;

    let bestId = null;
    let bestScore = 0;

    for (const m of Array.isArray(retrieved) ? retrieved : []) {
      if (!m?.id) continue;
      const memNorm = normalizeForMemoryMatch(m.text);
      if (!memNorm) continue;
      if (memNorm === targetNorm) return m.id;

      // Flexible similarity: token overlap ratio + substring len ratio.
      const memTokens = memNorm.split(' ').filter(Boolean);
      const setMem = new Set(memTokens);
      const overlap = tokens.filter((t) => setMem.has(t)).length;
      const overlapScore = overlap / tokenCount;

      const substringScore =
        memNorm.includes(targetNorm) || targetNorm.includes(memNorm)
          ? Math.min(targetNorm.length, memNorm.length) / Math.max(targetNorm.length, memNorm.length)
          : 0;

      const score = Math.max(overlapScore, substringScore);
      if (score > bestScore && score >= 0.45) {
        bestScore = score;
        bestId = m.id;
      }
    }

    return bestId;
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
    memoryEditorAbortController = controller;

    try {
      ensureMemoryEditorUIBindings();
      memoryEditorRunning = true;
      memoryEditorThinking = '';
      memoryEditorThinkingOpen = false;
      setStatusTemp('Updating memories…', { ms: 2500 });
      try {
        els.typingIndicator?.classList.remove('hidden');
        if (els.typingIndicatorLabelEl) els.typingIndicatorLabelEl.textContent = 'Updating memories...';
        startTypingSpinnerFallback();
      } catch {
        // ignore
      }
      updateMemoryEditorUI({ active: true, thinking: memoryEditorThinking });

      const memoryEditorSystem = (
        'You are Crystal Chat\'s Memory Editor AI. Your job is to maintain long-term memories about the user.\n'
        + 'Create as many memories as possible.\n'
        + 'Keep in mind memories can\'t reference each other; they must be separated.\n\n'
        + 'You will be given the chat context (including any retrieved memories).\n'
        + 'Decide whether to CREATE new memories, UPDATE existing ones, or DELETE useless/duplicated ones.\n\n'
        + 'Create memories for stable user facts such as: name, pronouns, location/timezone, language, preferences, dislikes, ongoing projects, recurring goals, constraints, tools they use, and long-term plans.\n'
        + 'Prefer 1 memory per fact. Keep each memory short, specific, and directly useful.\n'
        + 'If a new message refines an existing memory, UPDATE it instead of creating duplicates.\n'
        + 'If a memory is redundant, wrong, or low-value, DELETE it.\n'
        + 'For every response, include at least 1 new memory since there\'s always at least one useful thing in the user\'s prompt.\n\n'
        + 'Output ONLY a single line of JSON, no markdown, no prose, no explanation. Do not include any "thinking" content.\n'
        + 'If you are not sure, output {"actions":[]}.\n'
        + 'Keep your output under 400 characters total (excluding this prompt) to avoid truncation.\n'
        + 'IMPORTANT: Do NOT include any reasoning or thinking traces. Respond with the JSON only.\n'
        + 'Use human-readable memory text to reference existing memories (do NOT include memory ids).\n'
        + 'Schema:\n'
        + '{"actions":[{"type":"create","text":"..."},{"type":"update","match":"<existing memory text>","text":"...new text..."},{"type":"delete","match":"<existing memory text>"}]}\n'
        + 'You may also output {"create":[...],"update":[...],"delete":[...]} as an alternative.\n'
        + 'Fields "match", "memory", or "target" can be used to point to the existing memory text; capitalization and small wording differences are acceptable.\n'
        + 'If no changes are needed, output: {"actions":[]}.\n\n'
        + 'Examples (format only; do not copy content):\n'
        + '{"actions":[{"type":"create","text":"User\'s name is Sarah Willful."}]}\n'
        + '{"actions":[{"type":"update","match":"User prefers concise bullet answers.","text":"User prefers short, bullet-point answers."}]}\n'
        + '{"actions":[{"type":"delete","match":"User said they live in London."}]}\n\n'
        + `Retrieved memories (for reference): ${JSON.stringify((retrieved || []).map((m) => ({ id: m?.id, text: m?.text })))}\n`
        + `Very important: DO NOT REASON. Do not start with <think> and have a huge overthinking block. Users will have to wait for all that time, which is not good.`
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
        onThinking: () => {
          // Suppress thinking output entirely for memory editor to avoid model "thinking" blocks.
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

      let parsed = extractFirstJsonObject(editorOut);
      if (!parsed && editorFinal && typeof editorFinal === 'object') parsed = editorFinal;

      const actions = normalizeMemoryEditorActions(parsed);
      const resolvedActions = actions.map((a) => {
        if (!a) return a;
        const matchText = a.match || (a.type !== 'create' ? a.text : null);
        const resolvedId = a.id || findMemoryIdByText(matchText, retrieved);
        return { ...a, id: resolvedId, match: matchText };
      });
      console.log('[memories] memory editor parsed', {
        hasJson: !!parsed,
        actions: resolvedActions.map((a) => ({
          type: a.type,
          id: a.id,
          matchLen: (a?.match || '').length,
          textLen: (a?.text || '').length
        }))
      });

      if (!resolvedActions.length) {
        setStatusTemp('No memory changes');
        return;
      }

      const { addMemory, updateMemory, deleteMemoryById } = await import('./memories.js');
      for (const a of resolvedActions) {
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
    } finally {
      memoryEditorRunning = false;
      memoryEditorAbortController = null;
      updateMemoryEditorUI({ active: false, thinking: '' });
      try {
        if (!state.isStreaming) {
          els.typingIndicator?.classList.add('hidden');
          if (els.typingIndicatorLabelEl) els.typingIndicatorLabelEl.textContent = 'Processing response...';
          stopTypingSpinnerFallback();
        } else if (els.typingIndicatorLabelEl) {
          els.typingIndicatorLabelEl.textContent = 'Processing response...';
        }
      } catch {
        // ignore
      }
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
      if (!memoryEditorRunning) {
        els.typingIndicator.classList.add('hidden');
        stopTypingSpinnerFallback();
      } else if (els.typingIndicatorLabelEl) {
        els.typingIndicatorLabelEl.textContent = 'Updating memories...';
      }
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
