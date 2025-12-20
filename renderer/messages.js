import { applySuggestionToPrompt } from './newchat.js';
import { chatTitleFromMessages } from './sidebar.js';
import { createToggle } from './toggle.js';
import { MODEL } from './state.js';
import { formatModelName } from './formatModelName.js';
import { createCustomDropdown } from './customDropdown.js';
import { renderMessageElement } from './messageElement.js';
export { updateRenderedMessage } from './messageUpdate.js';

const HOME_MODEL_OPTIONS = [
  'qwen3-vl:2b-instruct',
  'qwen3-vl:4b-instruct',
  'qwen3-vl:8b-instruct',
  // Optional reasoning-enabled variants (download on selection)
  'qwen3-vl:2b',
  'qwen3-vl:4b',
  'qwen3-vl:8b'
];

export function renderActiveChat({
  els,
  state,
  tempChatId,
  tempChat,
  typingIndicator,
  autosizePrompt,
  saveUIState,
  renderActiveChatUI,
  onSuggestion,
  onCopyMessage,
  onRegenerateMessage,
  onDeleteUserMessage,
  onBeginEditUserMessage,
  onCancelEditUserMessage,
  onApplyEditUserMessage,
  onSwitchBranch
}) {
  const activeChatId = state.sidebarSelection.kind === 'chat' ? state.sidebarSelection.id : null;
  const chat = activeChatId === tempChatId ? tempChat : state.chats.find((c) => c.id === activeChatId);

  if (els.chatHeaderEl) els.chatHeaderEl.classList.remove('hidden');
  if (els.messagesEl) els.messagesEl.classList.remove('hidden');
  if (els.promptForm) {
    if (state.readOnlyMode) {
      els.promptForm.classList.add('hidden');
    } else {
      els.promptForm.classList.remove('hidden');
    }
  }
  if (els.errorEl) els.errorEl.classList.toggle('hidden', els.errorEl.textContent === '');

  if (els.chatHeaderTitleEl) {
    els.chatHeaderTitleEl.textContent = chat ? chatTitleFromMessages(chat) : 'Home Screen';
  }

  if (els.chatHeaderTokensEl) {
    let totalChars = 0;
    if (chat?.messages) {
      for (const m of chat.messages) {
        if (!m) continue;
        const c = (m.content || '').toString();
        const th = (m.thinking || '').toString();
        totalChars += c.length + th.length;
      }
    }
    const estTokens = Math.max(0, Math.ceil(totalChars / 4));
    els.chatHeaderTokensEl.textContent = `${estTokens} tokens`;
  }

  let messagesScrollTop = 0;
  try {
    messagesScrollTop = els.messagesEl.scrollTop;
  } catch {
    messagesScrollTop = 0;
  }

  try {
    els.messagesEl.querySelectorAll('.thinking-body[data-message-index]').forEach((el) => {
      if (el.classList.contains('hidden')) return;
      const idx = el.dataset.messageIndex;
      if (!idx) return;
      const i = Number(idx);
      if (!Number.isFinite(i) || i < 0) return;
      const m = chat?.messages?.[i];
      if (!m) return;
      m._thinkingScrollTop = el.scrollTop;
    });
  } catch {
    // ignore
  }

  els.messagesEl.innerHTML = '';
  els.messagesEl.classList.toggle('empty', false);

  if (!chat) {
    const layout = document.createElement('div');
    layout.className = 'home-layout';

    const validWidgets = ['intro', 'suggestions', 'temp-toggle', 'recent-chats', 'model-selector', 'creativity'];
    let draggingId = null;
    let lastHoverId = null;
    let lastHoverAfter = false;

    const currentOrder = () => {
      const ordered = Array.isArray(state.homeWidgets) && state.homeWidgets.length > 0
        ? state.homeWidgets.filter((w) => validWidgets.includes(w))
        : [...validWidgets];
      // de-dupe while preserving order
      return ordered.filter((id, idx) => ordered.indexOf(id) === idx);
    };

    const reorderWidgets = (sourceId, targetId, placeAfter = false) => {
      if (!sourceId || !targetId || sourceId === targetId) {
        console.log('[home-widgets] reorder skipped', { sourceId, targetId, placeAfter });
        return;
      }
      const ordered = currentOrder();
      const sourceIndex = ordered.indexOf(sourceId);
      const withoutSource = ordered.filter((w) => w !== sourceId);
      const targetIndex = withoutSource.indexOf(targetId);
      if (targetIndex === -1) {
        console.log('[home-widgets] reorder no target', { sourceId, targetId, ordered });
        return;
      }
      // If dropping on an item that is after the source, default to insert after to ensure movement.
      let effectiveAfter = placeAfter;
      if (sourceIndex > -1) {
        const targetOriginalIndex = ordered.indexOf(targetId);
        if (targetOriginalIndex > -1) {
          if (sourceIndex < targetOriginalIndex && !placeAfter) {
            effectiveAfter = true;
          } else if (sourceIndex > targetOriginalIndex && placeAfter) {
            effectiveAfter = false;
          }
        }
      }
      const insertAt = Math.min(
        withoutSource.length,
        Math.max(0, targetIndex + (effectiveAfter ? 1 : 0))
      );
      withoutSource.splice(insertAt, 0, sourceId);
      console.log('[home-widgets] reorder', {
        sourceId,
        targetId,
        placeAfter,
        effectiveAfter,
        before: ordered,
        after: withoutSource
      });
      state.homeWidgets = withoutSource;
      saveUIState(state);
      renderActiveChatUI();
    };

    const activeIds = currentOrder();

    const headerRow = document.createElement('div');
    headerRow.className = 'home-row';
    const title = document.createElement('div');
    title.className = 'home-title';
    title.textContent = 'Your home';
    const headerLeft = document.createElement('div');
    headerLeft.className = 'home-header-left';
    headerLeft.appendChild(title);
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'home-edit-btn';
    editBtn.textContent = state.homeEditMode ? 'Done' : 'Edit';
    editBtn.onclick = () => {
      state.homeEditMode = !state.homeEditMode;
      saveUIState(state);
      renderActiveChatUI();
    };
    if (state.homeEditMode) {
      const addRow = document.createElement('div');
      addRow.className = 'home-add-row';
      const missing = ['intro', 'suggestions', 'temp-toggle', 'recent-chats', 'model-selector', 'creativity'].filter((id) => !activeIds.includes(id));
      addRow.textContent = missing.length === 0 ? 'All widgets added' : 'Add widgets:';
      missing.forEach((id) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'home-add-btn';
        const labelMap = {
          intro: 'What can I help you',
          suggestions: 'Suggestions',
          'temp-toggle': 'Temporary chat',
          'recent-chats': 'Recent chats',
          'model-selector': 'Model selector',
          creativity: 'Creativity slider'
        };
        btn.textContent = labelMap[id] || id;
        btn.onclick = () => {
          state.homeWidgets = [...activeIds, id];
          saveUIState(state);
          renderActiveChatUI();
        };
        addRow.appendChild(btn);
      });
      headerLeft.appendChild(addRow);
    }
    headerRow.appendChild(headerLeft);
    headerRow.appendChild(editBtn);

    const widgetList = document.createElement('div');
    widgetList.className = 'home-list';

    const renderWidget = (id) => {
      const card = document.createElement('div');
      card.className = 'home-widget';
      card.dataset.widgetId = id;
      if (state.homeEditMode) {
        card.classList.add('draggable');
        card.setAttribute('draggable', 'true');
      }

      const tools = document.createElement('div');
      tools.className = 'home-widget-tools';
      tools.classList.toggle('visible', !!state.homeEditMode);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'home-widget-tool danger';
      removeBtn.textContent = '✕';
      removeBtn.onclick = () => {
        state.homeWidgets = state.homeWidgets.filter((w) => w !== id);
        saveUIState(state);
        renderActiveChatUI();
      };

      tools.appendChild(removeBtn);
      card.appendChild(tools);

      const body = document.createElement('div');
      body.className = 'home-widget-body';

      if (id === 'intro') {
        card.classList.add('home-widget-intro');
        const heading = document.createElement('div');
        heading.className = 'home-widget-heading';
        heading.textContent = 'What can I help you with today?';
        body.appendChild(heading);
      } else if (id === 'suggestions') {
        const heading = document.createElement('div');
        heading.className = 'home-widget-heading';
        heading.textContent = 'Try one of these';
        const grid = document.createElement('div');
        grid.className = 'home-suggestions-grid';
        const suggestions = [
          'What can you do?',
          'What are your limitations?',
          'Teach me how to prompt AI.',
          'How do you work behind the scenes?'
        ];
        suggestions.forEach((text) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'home-suggestion';
          btn.textContent = text;
          btn.onclick = () => applySuggestionToPrompt({ promptInput: els.promptInput, autosizePrompt, text });
          grid.appendChild(btn);
        });
        body.appendChild(heading);
        body.appendChild(grid);
      } else if (id === 'temp-toggle') {
        card.classList.add('home-widget-temp');
        const heading = document.createElement('div');
        heading.className = 'home-widget-heading';
        heading.textContent = 'Temporary chat';
        const desc = document.createElement('div');
        desc.className = 'home-widget-sub';
        desc.textContent = 'Not saved to history and memories stay off.';
        const row = document.createElement('div');
        row.className = 'home-temp-row';
        const textCol = document.createElement('div');
        textCol.className = 'home-temp-text';
        textCol.appendChild(heading);
        textCol.appendChild(desc);
        const toggle = createToggle({
          id: 'temporary-chat-toggle',
          text: 'Enable temporary chat',
          checked: !!state.temporaryChatEnabled,
          disabled: false,
          className: 'temp-chat-toggle',
          onChange: (v) => {
            state.temporaryChatEnabled = !!v;
            saveUIState(state);
          }
        });
        row.appendChild(textCol);
        row.appendChild(toggle.el);
        body.appendChild(row);
      } else if (id === 'recent-chats') {
        card.classList.add('home-widget-recent');
        const heading = document.createElement('div');
        heading.className = 'home-widget-heading';
        heading.textContent = 'Recent chats';
        body.appendChild(heading);

        const list = document.createElement('div');
        list.className = 'home-recent-list';

        const sorted = [...(state.chats || [])]
          .map((c) => {
            const latestMsgTs = Array.isArray(c?.messages) && c.messages.length
              ? Math.max(...c.messages.map((m) => Number(m?.createdAt) || 0))
              : 0;
            const updatedAt = Math.max(Number(c?.updatedAt) || 0, Number(c?.createdAt) || 0, latestMsgTs);
            return { chat: c, updatedAt };
          })
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, 5);

        if (!sorted.length) {
          const empty = document.createElement('div');
          empty.className = 'home-recent-empty';
          empty.textContent = 'No recent chats yet.';
          list.appendChild(empty);
        } else {
          sorted.forEach(({ chat: c, updatedAt }) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'home-recent-item';
            const title = document.createElement('div');
            title.className = 'home-recent-title';
            title.textContent = chatTitleFromMessages(c);
            const meta = document.createElement('div');
            meta.className = 'home-recent-meta';
            const ts = updatedAt ? new Date(updatedAt).toLocaleString() : '';
            meta.textContent = ts;
            item.appendChild(title);
            item.appendChild(meta);
            item.onclick = () => {
              state.sidebarSelection = { kind: 'chat', id: c.id };
              state.pendingNew = false;
              saveUIState(state);
              renderActiveChatUI();
            };
            list.appendChild(item);
          });
        }
        body.appendChild(list);
      } else if (id === 'model-selector') {
        card.classList.add('home-widget-model');
        const heading = document.createElement('div');
        heading.className = 'home-widget-heading';
        heading.textContent = 'Model';
        const sub = document.createElement('div');
        sub.className = 'home-widget-sub';
        sub.textContent = `Current: ${formatModelName(state.selectedModel || MODEL)}`;
        const dropdownRoot = document.createElement('div');
        dropdownRoot.className = 'home-model-dropdown';
        let dropdown = null;
        const buildDropdown = () => {
          dropdownRoot.innerHTML = '';
          dropdown = createCustomDropdown({
            rootEl: dropdownRoot,
            options: HOME_MODEL_OPTIONS.map((m) => ({ value: m, label: formatModelName(m) })),
            value: state.selectedModel || MODEL,
            ariaLabel: 'Model',
            onChange: (next) => {
              const model = next || MODEL;
              state.selectedModel = model;
              saveUIState(state);
              sub.textContent = `Current: ${formatModelName(model)}`;
              try {
                window.dispatchEvent(new CustomEvent('cc:modelChanged', { detail: { model } }));
              } catch {
                // ignore
              }
            }
          });
        };
        buildDropdown();
        body.appendChild(heading);
        body.appendChild(sub);
        body.appendChild(dropdownRoot);
      } else if (id === 'creativity') {
        card.classList.add('home-widget-creativity');
        const heading = document.createElement('div');
        heading.className = 'home-widget-heading';
        heading.textContent = 'Creativity';
        const sub = document.createElement('div');
        sub.className = 'home-widget-sub';
        sub.textContent = 'Adjust randomness globally.';
        const sliderRow = document.createElement('div');
        sliderRow.className = 'home-creativity-row';
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '2';
        slider.step = '0.05';
        slider.value = String(state.creativity ?? 1);
        slider.className = 'home-creativity-slider';
        const value = document.createElement('div');
        value.className = 'home-creativity-value';
        value.textContent = Number(state.creativity ?? 1).toFixed(2);
        slider.oninput = () => {
          const v = Number(slider.value);
          const clamped = Number.isFinite(v) ? Math.min(2, Math.max(0, v)) : 1;
          state.creativity = clamped;
          value.textContent = clamped.toFixed(2);
        };
        slider.onchange = () => {
          saveUIState(state);
          try {
            window.dispatchEvent(new CustomEvent('cc:creativityChanged', { detail: { creativity: state.creativity } }));
          } catch {
            // ignore
          }
        };
        sliderRow.appendChild(slider);
        sliderRow.appendChild(value);
        body.appendChild(heading);
        body.appendChild(sub);
        body.appendChild(sliderRow);
      } else {
        body.textContent = 'Unknown widget';
      }

      card.appendChild(body);

      if (state.homeEditMode) {
        card.addEventListener('dragstart', (e) => {
          draggingId = id;
          lastHoverId = null;
          lastHoverAfter = false;
          card.classList.add('dragging');
          console.log('[home-widgets] dragstart', { id });
          try {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', id);
          } catch {
            // ignore
          }
        });
        card.addEventListener('dragend', () => {
          document.querySelectorAll('.home-widget.drag-over').forEach((el) => {
            el.classList.remove('drag-over', 'drag-over-after');
          });
          console.log('[home-widgets] dragend', { draggingId, lastHoverId, lastHoverAfter });
          // If drop never fired but we have a hover target, reorder as a fallback.
          if (draggingId && lastHoverId && lastHoverId !== draggingId) {
            reorderWidgets(draggingId, lastHoverId, !!lastHoverAfter);
          }
          draggingId = null;
          lastHoverId = null;
          lastHoverAfter = false;
          card.classList.remove('dragging');
          card.classList.remove('drag-over');
        });
        card.addEventListener('dragover', (e) => {
          if (!draggingId || draggingId === id) return;
          e.preventDefault();
          try {
            e.dataTransfer.dropEffect = 'move';
          } catch {
            // ignore
          }
          const rect = card.getBoundingClientRect();
          const placeAfter = (e.clientY - rect.top) > rect.height / 2;
          lastHoverId = id;
          lastHoverAfter = placeAfter;
          document.querySelectorAll('.home-widget.drag-over').forEach((el) => {
            el.classList.remove('drag-over', 'drag-over-after');
          });
          card.classList.add('drag-over');
          card.classList.toggle('drag-over-after', placeAfter);
          console.log('[home-widgets] dragover card', { draggingId, targetId: id, placeAfter });
        });
        card.addEventListener('dragleave', () => {
          card.classList.remove('drag-over', 'drag-over-after');
        });
        card.addEventListener('drop', (e) => {
          if (!draggingId || draggingId === id) return;
          e.preventDefault();
          const sourceId = draggingId;
          const rect = card.getBoundingClientRect();
          const placeAfter = (e.clientY - rect.top) > rect.height / 2;
          document.querySelectorAll('.home-widget.drag-over').forEach((el) => {
            el.classList.remove('drag-over', 'drag-over-after');
          });
          draggingId = null;
          lastHoverId = null;
          lastHoverAfter = false;
          console.log('[home-widgets] drop on card', { sourceId, targetId: id, placeAfter });
          reorderWidgets(sourceId, id, placeAfter);
        });
      }

      return card;
    };

    activeIds.forEach((id) => widgetList.appendChild(renderWidget(id)));

    if (state.homeEditMode) {
      const handleDocumentDragOver = (e) => {
        if (!draggingId) return;
        e.preventDefault();
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const card = el?.closest?.('.home-widget');
        if (card) {
          const targetId = card.dataset.widgetId;
          if (targetId && targetId !== draggingId) {
            const rect = card.getBoundingClientRect();
            const placeAfter = (e.clientY - rect.top) > rect.height / 2;
            lastHoverId = targetId;
            lastHoverAfter = placeAfter;
            document.querySelectorAll('.home-widget.drag-over').forEach((node) => {
              node.classList.remove('drag-over', 'drag-over-after');
            });
            card.classList.add('drag-over');
            card.classList.toggle('drag-over-after', placeAfter);
          }
        }
      };

      const handleDocumentDrop = (e) => {
        if (!draggingId) return;
        e.preventDefault();
        const sourceId = draggingId;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const card = el?.closest?.('.home-widget');
        let targetId = card?.dataset?.widgetId || null;
        let placeAfter = false;
        if (targetId && targetId !== sourceId) {
          const rect = card.getBoundingClientRect();
          placeAfter = (e.clientY - rect.top) > rect.height / 2;
        } else if (lastHoverId && lastHoverId !== sourceId) {
          targetId = lastHoverId;
          placeAfter = !!lastHoverAfter;
        }
        document.querySelectorAll('.home-widget.drag-over').forEach((node) => {
          node.classList.remove('drag-over', 'drag-over-after');
        });
        draggingId = null;
        lastHoverId = null;
        lastHoverAfter = false;
        if (targetId && targetId !== sourceId) {
          console.log('[home-widgets] document drop resolved target', { sourceId, targetId, placeAfter });
          reorderWidgets(sourceId, targetId, placeAfter);
          return;
        }
        const ordered = currentOrder();
        const withoutSource = ordered.filter((w) => w !== sourceId);
        withoutSource.push(sourceId);
        console.log('[home-widgets] document drop fallback append', { sourceId, before: ordered, after: withoutSource });
        state.homeWidgets = withoutSource;
        saveUIState(state);
        renderActiveChatUI();
      };

      const handleDragOver = (e) => {
        if (!draggingId) return;
        e.preventDefault();
        try {
          e.dataTransfer.dropEffect = 'move';
        } catch {
          // ignore
        }
        const card = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.home-widget');
        if (card) {
          const targetId = card.dataset.widgetId;
          if (targetId && targetId !== draggingId) {
            const rect = card.getBoundingClientRect();
            const placeAfter = (e.clientY - rect.top) > rect.height / 2;
            lastHoverId = targetId;
            lastHoverAfter = placeAfter;
            document.querySelectorAll('.home-widget.drag-over').forEach((el) => {
              el.classList.remove('drag-over', 'drag-over-after');
            });
            card.classList.add('drag-over');
            card.classList.toggle('drag-over-after', placeAfter);
          }
        }
      };

      const handleDrop = (e) => {
        if (!draggingId) return;
        e.preventDefault();
        const sourceId = draggingId;
        const card = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.home-widget');
        let targetId = card?.dataset?.widgetId || null;
        let placeAfter = false;
        if (targetId && targetId !== sourceId) {
          const rect = card.getBoundingClientRect();
          placeAfter = (e.clientY - rect.top) > rect.height / 2;
        } else if (lastHoverId && lastHoverId !== sourceId) {
          targetId = lastHoverId;
          placeAfter = !!lastHoverAfter;
        }
        document.querySelectorAll('.home-widget.drag-over').forEach((el) => {
          el.classList.remove('drag-over', 'drag-over-after');
        });
        draggingId = null;
        lastHoverId = null;
        lastHoverAfter = false;
        if (targetId && targetId !== sourceId) {
          console.log('[home-widgets] drop resolved target', { sourceId, targetId, placeAfter });
          reorderWidgets(sourceId, targetId, placeAfter);
          return;
        }
        const ordered = currentOrder();
        const withoutSource = ordered.filter((w) => w !== sourceId);
        withoutSource.push(sourceId);
        console.log('[home-widgets] drop on empty grid', { sourceId, before: ordered, after: withoutSource });
        state.homeWidgets = withoutSource;
        saveUIState(state);
        renderActiveChatUI();
      };

      widgetList.addEventListener('dragover', handleDragOver, true);
      widgetList.addEventListener('drop', handleDrop, true);
      document.addEventListener('dragover', handleDocumentDragOver, true);
      document.addEventListener('drop', handleDocumentDrop, true);
    }

    layout.appendChild(headerRow);
    layout.appendChild(widgetList);

    els.messagesEl.appendChild(layout);
    els.messagesEl.appendChild(typingIndicator);
    els.messagesEl.classList.add('empty');
    return;
  }

  chat.messages.forEach((msg, messageIndex) => {
    els.messagesEl.appendChild(renderMessageElement(msg, {
      onCopy: onCopyMessage,
      onRegenerate: onRegenerateMessage,
      onDeleteUserMessage,
      onBeginEditUserMessage,
      onCancelEditUserMessage,
      onApplyEditUserMessage,
      onSwitchBranch,
      messageIndex,
      chat,
      state
    }));
  });
  els.messagesEl.appendChild(typingIndicator);

  // Restore scroll after layout to avoid it being clobbered while the element is still measuring.
  window.requestAnimationFrame(() => {
    try {
      els.messagesEl.querySelectorAll('.thinking-body[data-message-index]').forEach((el) => {
        if (el.classList.contains('hidden')) return;
        const idx = el.dataset.messageIndex;
        if (!idx) return;
        const i = Number(idx);
        if (!Number.isFinite(i) || i < 0) return;
        const m = chat?.messages?.[i];
        if (!m) return;
        const st = Number.isFinite(m._thinkingScrollTop) ? m._thinkingScrollTop : 0;
        el.scrollTop = Math.max(0, st);
      });
    } catch {
      // ignore
    }

    try {
      els.messagesEl.scrollTop = messagesScrollTop;
    } catch {
      // ignore
    }
  });
}
