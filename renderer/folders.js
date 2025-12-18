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
  const activeChatId = state?.sidebarSelection?.kind === 'chat' ? state.sidebarSelection.id : null;

  const chatsById = new Map((state.chats || []).map((c) => [((c?.id || '').toString().trim()), c]));
  const rootChats = (state.rootChatIds || [])
    .map((x) => (x || '').toString().trim())
    .filter(Boolean)
    .map((id) => chatsById.get(id))
    .filter((c) => c && !c.deletedAt);

  const rootSection = document.createElement('div');
  rootSection.className = 'folders-root-section';

  const rootChatsEl = document.createElement('div');
  rootChatsEl.className = 'folder-chats folder-root-chats';

  const rootDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.dataTransfer.dropEffect = 'move';
    } catch {
      // ignore
    }
    rootSection.classList.add('drag-over');
  };

  rootSection.ondragover = rootDragOver;
  rootSection.ondragenter = rootDragOver;
  rootSection.ondragleave = () => {
    rootSection.classList.remove('drag-over');
  };
  rootSection.ondrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    rootSection.classList.remove('drag-over');
    onDropOnRoot?.(e);
  };

  const getFoldersFlatLocal = () => {
    const out = [];
    const walk = (arr, depth) => {
      (arr || []).forEach((f) => {
        if (!f) return;
        out.push({ id: f.id, name: (f.name || 'Folder').toString(), depth: depth || 0 });
        walk(f.folders || [], (depth || 0) + 1);
      });
    };
    walk(folders, 0);
    return out;
  };

  const makeChatMenu = ({ chatId, onRemove }) => {
    const wrap = document.createElement('div');
    wrap.className = 'chat-menu-wrap';

    const menuBtn = document.createElement('button');
    menuBtn.className = 'chat-menu-btn';
    menuBtn.type = 'button';
    menuBtn.setAttribute('aria-label', 'Chat actions');
    menuBtn.setAttribute('aria-haspopup', 'menu');
    menuBtn.textContent = '⋯';

    const menu = document.createElement('div');
    menu.className = 'chat-menu hidden';
    menu.setAttribute('role', 'menu');

    let cleanupMenuEvents = null;
    const closeMenu = () => {
      menu.classList.add('hidden');
      menuBtn.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      if (cleanupMenuEvents) {
        cleanupMenuEvents();
        cleanupMenuEvents = null;
      }
    };

    const openMenu = () => {
      if (cleanupMenuEvents) {
        cleanupMenuEvents();
        cleanupMenuEvents = null;
      }
      menu.classList.remove('hidden');
      menuBtn.classList.add('open');
      menuBtn.setAttribute('aria-expanded', 'true');

      const onDocClick = (ev) => {
        if (!wrap.contains(ev.target)) closeMenu();
      };
      const onKeyDown = (ev) => {
        if (ev.key === 'Escape') {
          ev.preventDefault();
          closeMenu();
        }
      };
      window.addEventListener('click', onDocClick, true);
      window.addEventListener('keydown', onKeyDown, true);
      cleanupMenuEvents = () => {
        window.removeEventListener('click', onDocClick, true);
        window.removeEventListener('keydown', onKeyDown, true);
      };
    };

    const buildMainMenu = () => {
      menu.innerHTML = '';

      const moveItem = document.createElement('button');
      moveItem.type = 'button';
      moveItem.className = 'chat-menu-item has-submenu';
      moveItem.setAttribute('role', 'menuitem');
      moveItem.setAttribute('aria-haspopup', 'menu');
      moveItem.innerHTML = '<span class="chat-menu-item-text">Move to…</span><span class="chat-menu-item-chevron" aria-hidden="true">▸</span>';

      const removeItem = document.createElement('button');
      removeItem.type = 'button';
      removeItem.className = 'chat-menu-item';
      removeItem.setAttribute('role', 'menuitem');
      removeItem.innerHTML = '<span class="chat-menu-item-text">Remove</span>';

      const deleteItem = document.createElement('button');
      deleteItem.type = 'button';
      deleteItem.className = 'chat-menu-item danger';
      deleteItem.setAttribute('role', 'menuitem');
      deleteItem.innerHTML = '<span class="chat-menu-item-text">Delete</span>';

      moveItem.onclick = (e) => {
        e.stopPropagation();
        menu.innerHTML = '';

        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'chat-menu-item';
        back.setAttribute('role', 'menuitem');
        back.innerHTML = '<span class="chat-menu-item-text">← Back</span>';
        back.onclick = (ev) => {
          ev.stopPropagation();
          buildMainMenu();
        };
        menu.appendChild(back);

        const mk = (label, folderId) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'chat-menu-item';
          b.setAttribute('role', 'menuitem');
          b.innerHTML = `<span class="chat-menu-item-text">${escapeHtml(label)}</span>`;
          b.onclick = (ev) => {
            ev.stopPropagation();
            try {
              window.dispatchEvent(new CustomEvent('cc:moveChatToFolder', { detail: { chatId, folderId } }));
            } catch {
              // ignore
            }
            closeMenu();
          };
          menu.appendChild(b);
        };

        mk('Root', null);
        getFoldersFlatLocal().forEach((f) => {
          const prefix = f.depth ? `${'—'.repeat(Math.min(6, f.depth))} ` : '';
          mk(prefix + (f.name || 'Folder'), f.id);
        });
      };

      removeItem.onclick = (e) => {
        e.stopPropagation();
        onRemove?.();
        closeMenu();
      };

      deleteItem.onclick = (e) => {
        e.stopPropagation();
        try {
          window.dispatchEvent(new CustomEvent('cc:trashChat', { detail: { chatId } }));
        } catch {
          // ignore
        }
        closeMenu();
      };

      menu.appendChild(moveItem);
      menu.appendChild(removeItem);
      menu.appendChild(deleteItem);
    };

    buildMainMenu();

    menuBtn.onclick = (e) => {
      e.stopPropagation();
      if (!menu.classList.contains('hidden')) closeMenu();
      else openMenu();
    };
    menu.onclick = (e) => {
      e.stopPropagation();
    };

    wrap.appendChild(menuBtn);
    wrap.appendChild(menu);
    return wrap;
  };

  rootChats.forEach((chat) => {
    const chatId = (chat.id || '').toString().trim();
    if (!chatId) return;
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

    row.appendChild(
      makeChatMenu({
        chatId,
        onRemove: () => {
          try {
            window.dispatchEvent(new CustomEvent('cc:removeChatFromRoot', { detail: { chatId } }));
          } catch {
            // ignore
          }
        }
      })
    );

    rootChatsEl.appendChild(row);
  });

  rootSection.appendChild(rootChatsEl);
  els.foldersListEl.appendChild(rootSection);

  if (!folders || folders.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'folders-empty';
    empty.textContent = 'No folders yet.';
    els.foldersListEl.appendChild(empty);
    return;
  }

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
      const chat = chatsById.get((chatId || '').toString().trim());
      if (!chat || chat.deletedAt) return;

      const row = document.createElement('div');
      row.className = `folder-chat-item ${chat.id === activeChatId ? 'active' : ''}`;
      row.onclick = () => onOpenChat?.(chat.id);
      row.draggable = true;
      row.ondragstart = (e) => {
        onDragStartChat?.(e, chat.id);
      };

      const name = document.createElement('div');
      name.className = 'folder-chat-name';
      name.textContent = chatTitleFromMessages(chat);
      row.appendChild(name);

      row.appendChild(
        makeChatMenu({
          chatId: (chat.id || '').toString().trim(),
          onRemove: () => {
            onRemoveChatFromFolder?.(folder.id, (chat.id || '').toString().trim());
          }
        })
      );

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
