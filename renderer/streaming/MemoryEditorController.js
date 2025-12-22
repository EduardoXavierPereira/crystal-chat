/**
 * Memory editor controller - updates long-term memories after chat responses
 * Uses AI to decide which memories to create/update/delete based on conversation
 */

import { findMemoryIdByText } from './MemoryMatcher.js';
import { setStatusTemp, extractFirstJsonObject, normalizeMemoryEditorActions } from './utils.js';

export class MemoryEditorController {
  constructor({
    els,
    state,
    getApiUrl,
    streamChat,
    embedText,
    embeddingModel,
    tempChatId,
    db,
    typingIndicator
  }) {
    this.els = els;
    this.state = state;
    this.getApiUrl = getApiUrl;
    this.streamChat = streamChat;
    this.embedText = embedText;
    this.embeddingModel = embeddingModel;
    this.tempChatId = tempChatId;
    this.db = db;
    this.typingIndicator = typingIndicator;

    // State machine
    this.memoryEditorRunning = false;
    this.memoryEditorQueuedJob = null;
    this.memoryEditorAbortController = null;
    this.memoryEditorThinking = '';
    this.memoryEditorThinkingOpen = false;

    // UI bindings setup
    this._uiBindingsWired = false;
  }

  /**
   * Queue a memory editor job
   * Latest job coalesces/replaces older jobs since newer context supersedes older
   * @param {object} job - Memory editor job with apiUrl, responseModel, embModel, sendMessages, etc.
   */
  enqueue(job) {
    this.memoryEditorQueuedJob = job;
    void this._processMemoryEditorQueue();
  }

  /**
   * Skip/abort current memory editor job
   */
  skip() {
    if (this.memoryEditorAbortController) {
      try {
        this.memoryEditorAbortController.abort();
      } catch {
        // ignore
      }
    }
    this.memoryEditorQueuedJob = null;
    this.memoryEditorRunning = false;
    this.memoryEditorAbortController = null;
    setStatusTemp(this.els?.statusEl, 'Memory editor skipped');
    this._updateMemoryEditorUI({ active: false, thinking: '' });
    // Hide typing indicator if no other work
    try {
      if (!this.state.isStreaming) {
        this.els?.typingIndicator?.classList.add('hidden');
        this.typingIndicator?.hide();
      }
    } catch {
      // ignore
    }
  }

  /**
   * Process queued memory editor job(s)
   * Runs jobs sequentially, coalescing duplicate requests
   * @private
   */
  async _processMemoryEditorQueue() {
    if (this.memoryEditorRunning) return;
    this.memoryEditorRunning = true;
    try {
      while (this.memoryEditorQueuedJob) {
        const job = this.memoryEditorQueuedJob;
        this.memoryEditorQueuedJob = null;
        await this._runMemoryEditorJob(job);
      }
    } finally {
      this.memoryEditorRunning = false;
    }
  }

  /**
   * Run a single memory editor job
   * @private
   */
  async _runMemoryEditorJob(job) {
    const {
      apiUrl,
      responseModel,
      embModel,
      sendMessages,
      assistantContent,
      retrieved
    } = job || {};

    if (!apiUrl || !responseModel || !embModel || !this.db || !this.streamChat || !this.embedText) return;

    const controller = new AbortController();
    this.memoryEditorAbortController = controller;

    try {
      this._ensureMemoryEditorUIBindings();
      this.memoryEditorRunning = true;
      this.memoryEditorThinking = '';
      this.memoryEditorThinkingOpen = false;
      setStatusTemp(this.els?.statusEl, 'Updating memories…', { ms: 2500 });

      try {
        this.els?.typingIndicator?.classList.remove('hidden');
        if (this.els?.typingIndicatorLabelEl) {
          this.els.typingIndicatorLabelEl.textContent = 'Updating memories...';
        }
        this.typingIndicator?.show();
      } catch {
        // ignore
      }

      this._updateMemoryEditorUI({ active: true, thinking: this.memoryEditorThinking });

      const memoryEditorSystem = this._buildMemoryEditorSystemPrompt(retrieved);

      let editorOut = '';
      let editorFinal = null;
      await this.streamChat({
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
          // Suppress thinking output for memory editor to avoid model "thinking" blocks
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
        setStatusTemp(this.els?.statusEl, 'No memory changes');
        return;
      }

      // Dynamically import memory operations
      const { addMemory, updateMemory, deleteMemoryById } = await import('../memories.js');

      for (const a of resolvedActions) {
        if (!a || a.type === 'delete') {
          if (a?.id) await deleteMemoryById(this.db, a.id);
          continue;
        }

        const text = (a.text || '').toString().trim();
        if (!text) continue;

        const emb = await this.embedText({
          apiUrl,
          model: embModel,
          text,
          signal: controller.signal
        });

        if (a.type === 'create') {
          await addMemory(this.db, { text, embedding: emb, createdAt: Date.now() });
        } else if (a.type === 'update') {
          if (!a.id) continue;
          await updateMemory(this.db, { id: a.id, text, embedding: emb, updatedAt: Date.now() });
        }
      }

      try {
        window.dispatchEvent(new CustomEvent('cc:memoriesChanged', { detail: { reason: 'editor' } }));
      } catch {
        // ignore
      }

      setStatusTemp(this.els?.statusEl, 'Memories updated');
    } catch (e) {
      console.warn('[memories] memory editor failed', e);
      setStatusTemp(this.els?.statusEl, 'Memory editor failed');
    } finally {
      this.memoryEditorRunning = false;
      this.memoryEditorAbortController = null;
      this._updateMemoryEditorUI({ active: false, thinking: '' });

      try {
        if (!this.state.isStreaming) {
          this.els?.typingIndicator?.classList.add('hidden');
          if (this.els?.typingIndicatorLabelEl) {
            this.els.typingIndicatorLabelEl.textContent = 'Processing response...';
          }
          this.typingIndicator?.hide();
        } else if (this.els?.typingIndicatorLabelEl) {
          this.els.typingIndicatorLabelEl.textContent = 'Processing response...';
        }
      } catch {
        // ignore
      }
    }
  }

  /**
   * Build system prompt for memory editor AI
   * @private
   */
  _buildMemoryEditorSystemPrompt(retrieved) {
    return (
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
  }

  /**
   * Update memory editor UI visibility and content
   * @private
   */
  _updateMemoryEditorUI({ active = false, thinking = null } = {}) {
    try {
      const panel = this.els?.memoryEditorPanelEl;
      const toggle = this.els?.memoryEditorThinkingToggleEl;
      const thinkingEl = this.els?.memoryEditorThinkingEl;
      if (!panel || !toggle || !thinkingEl) return;

      if (thinking !== null && typeof thinking === 'string') {
        thinkingEl.textContent = thinking;
      }

      panel.classList.toggle('hidden', !active);
      thinkingEl.classList.toggle('hidden', !this.memoryEditorThinkingOpen);
      toggle.classList.toggle('open', !!this.memoryEditorThinkingOpen);
      toggle.setAttribute('aria-expanded', this.memoryEditorThinkingOpen ? 'true' : 'false');
    } catch {
      // ignore
    }
  }

  /**
   * Wire up UI event listeners for memory editor controls
   * Uses lazy binding - only wires once on first use
   * @private
   */
  _ensureMemoryEditorUIBindings() {
    if (this._uiBindingsWired) return;
    this._uiBindingsWired = true;

    try {
      const toggle = this.els?.memoryEditorThinkingToggleEl;
      const thinkingEl = this.els?.memoryEditorThinkingEl;
      if (toggle && thinkingEl) {
        toggle.addEventListener('click', () => {
          this.memoryEditorThinkingOpen = !this.memoryEditorThinkingOpen;
          this._updateMemoryEditorUI({ active: this.memoryEditorRunning });
        });
      }
    } catch {
      // ignore
    }

    try {
      const skipBtn = this.els?.memoryEditorSkipBtn;
      if (skipBtn) {
        skipBtn.addEventListener('click', () => {
          this.skip();
        });
      }
    } catch {
      // ignore
    }
  }

  /**
   * Check if memory editor is currently running
   * @returns {boolean}
   */
  isRunning() {
    return this.memoryEditorRunning;
  }

  /**
   * Destroy controller and clean up resources
   */
  destroy() {
    this.skip();
    this.els = null;
    this.state = null;
    this.db = null;
    this.typingIndicator = null;
  }
}
