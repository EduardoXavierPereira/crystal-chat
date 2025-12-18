import { chatTitleFromMessages } from './sidebar.js';

function escapeHtml(text) {
  return (text || '').replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return ch;
    }
  });
}

export function renderFoldersTree({
  els,
  state,
  folders,
  onToggleOpen,
  onOpenChat,
  onDragStartChat,
  onDragStartFolder,
  onRemoveChatFromFolder,
  onDropOnFolder,
  onDropOnRoot
}) {
  if (!els.foldersListEl) return;
  els.foldersListEl.innerHTML = '';

  const rootDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onDropOnRoot?.(e);
  };

  els.foldersListEl.ondragover = (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {
      // ignore
    }
  };
  els.foldersListEl.ondrop = rootDrop;

  if (!folders || folders.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'folders-empty';
    empty.textContent = 'No folders yet.';
    els.foldersListEl.appendChild(empty);
    return;
  }

  const byId = new Map((state.chats || []).map((c) => [c.id, c]));
  const activeChatId = state?.sidebarSelection?.kind === 'chat' ? state.sidebarSelection.id : null;

  const renderFolder = (folder, depth) => {
    const wrap = document.createElement('div');
    wrap.className = 'folder-node';
    wrap.style.setProperty('--folder-depth', String(depth));

    const header = document.createElement('button');
    header.type = 'button';
    header.className = `folder-header ${folder.open ? 'open' : ''}`;

    header.innerHTML =
      '<span class="folder-header-left">'
      + '<span class="folder-chevron" aria-hidden="true">▸</span>'
      + `<span class="folder-name">${escapeHtml(folder.name || 'Folder')}</span>`
      + '</span>';

    header.onclick = (e) => {
      e.preventDefault();
      onToggleOpen?.(folder.id);
    };

    header.draggable = true;
    header.ondragstart = (e) => {
      onDragStartFolder?.(e, folder.id);
    };

    header.ondragover = (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        e.dataTransfer.dropEffect = 'move';
      } catch {
        // ignore
      }
      header.classList.add('drag-over');
    };

    header.ondragleave = () => {
      header.classList.remove('drag-over');
    };

    header.ondrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      header.classList.remove('drag-over');
      onDropOnFolder?.(e, folder.id);
    };

    wrap.appendChild(header);

    const body = document.createElement('div');
    body.className = `folder-body ${folder.open ? '' : 'hidden'}`;

    const children = document.createElement('div');
    children.className = 'folder-children';

    (folder.folders || []).forEach((child) => {
      children.appendChild(renderFolder(child, depth + 1));
    });

    const chatsEl = document.createElement('div');
    chatsEl.className = 'folder-chats';

    (folder.chatIds || []).forEach((chatId) => {
      const chat = byId.get(chatId);
      if (!chat || chat.deletedAt) return;

      const row = document.createElement('div');
      row.className = `folder-chat-item ${chatId === activeChatId ? 'active' : ''}`;
      row.onclick = () => onOpenChat?.(chatId);
      row.draggable = true;
      row.ondragstart = (e) => {
        onDragStartChat?.(e, chatId);
      };

      const name = document.createElement('div');
      name.className = 'folder-chat-name';
      name.textContent = chatTitleFromMessages(chat);
      row.appendChild(name);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'folder-chat-remove';
      removeBtn.setAttribute('aria-label', 'Remove from folder');
      removeBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
        + '<path d="M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
        + '<path d="M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
        + '</svg>';
      removeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onRemoveChatFromFolder?.(folder.id, chatId);
      };
      row.appendChild(removeBtn);

      chatsEl.appendChild(row);
    });

    body.appendChild(children);
    body.appendChild(chatsEl);

    wrap.appendChild(body);
    return wrap;
  };

  folders.forEach((f) => {
    els.foldersListEl.appendChild(renderFolder(f, 0));
  });
}
