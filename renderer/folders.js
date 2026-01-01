import { chatTitleFromMessages } from './sidebar.js';
import { buildMenu, ICONS, escapeHtml } from './utils/menuBuilder.js';

export function renderFoldersTree({
  els,
  state,
  folders,
  onToggleOpen,
  onDeleteFolder,
  onOpenChat,
  onDragStartChat,
  onDragStartFolder,
  onRemoveChatFromFolder,
  onDropOnFolder,
  onDropOnRoot,
  onStartRename,
  onStartRenameFolder
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

  rootChats.forEach((chat) => {
    const chatId = (chat.id || '').toString().trim();
    if (!chatId) return;
    const row = document.createElement('div');
    row.className = `folder-chat-item ${chatId === activeChatId ? 'active' : ''}`;

    const isEditingChat = state.renamingId === chatId;

    if (!isEditingChat) {
      row.onclick = () => onOpenChat?.(chatId);
    }
    row.draggable = true;
    row.ondragstart = (e) => {
      onDragStartChat?.(e, chatId);
    };

    const name = document.createElement('div');
    name.className = 'folder-chat-name';

    if (isEditingChat) {
      const input = document.createElement('input');
      input.className = 'chat-rename-input';
      input.value = chatTitleFromMessages(chat);
      input.onkeydown = async (e) => {
        e.stopPropagation(); // Prevents bubbling to parent containers/buttons
        if (e.key === 'Enter') {
          e.preventDefault();
          await onStartRename?.commit(chatId, input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          await onStartRename?.cancel();
        }
      };
      input.onblur = async () => {
        await onStartRename?.commit(chatId, input.value);
      };
      name.appendChild(input);
      requestAnimationFrame(() => input.focus());
    } else {
      name.textContent = chatTitleFromMessages(chat);
    }
    row.appendChild(name);

    row.appendChild(
      buildMenu({
        ariaLabel: 'Chat actions',
        items: [
          {
            label: 'Move to…',
            icon: ICONS.folder,
            isSubmenu: true,
            onClick: () => {
              // Submenu handled by buildMenu
            }
          },
          {
            label: 'Rename',
            icon: ICONS.rename,
            onClick: () => {
              onStartRename?.begin(chatId);
            }
          },
          {
            label: 'Delete',
            icon: ICONS.trash,
            isDanger: true,
            onClick: () => {
              try {
                window.dispatchEvent(new CustomEvent('cc:trashChat', { detail: { chatId } }));
              } catch {
                // ignore
              }
            }
          }
        ],
        getFoldersList: () => {
          const root = { label: 'Root', id: null, onClick: (folderId) => {
            try {
              window.dispatchEvent(new CustomEvent('cc:moveChatToFolder', { detail: { chatId, folderId } }));
            } catch {
              // ignore
            }
          } };
          return [root, ...getFoldersFlatLocal().map((f) => ({
            label: (f.depth ? `${'—'.repeat(Math.min(6, f.depth))} ` : '') + (f.name || 'Folder'),
            id: f.id,
            onClick: (folderId) => {
              try {
                window.dispatchEvent(new CustomEvent('cc:moveChatToFolder', { detail: { chatId, folderId } }));
              } catch {
                // ignore
              }
            }
          }))];
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

    const headerLeft = document.createElement('span');
    headerLeft.className = 'folder-header-left';

    const chevron = document.createElement('span');
    chevron.className = 'folder-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▸';
    headerLeft.appendChild(chevron);

    const iconEl = document.createElement('span');
    iconEl.className = 'folder-icon';
    iconEl.textContent = (folder.icon || '📁').toString();
    headerLeft.appendChild(iconEl);

    const nameEl = document.createElement('span');
    nameEl.className = 'folder-name';
    const isEditingFolder = state.renamingFolderId === folder.id;

    if (isEditingFolder) {
      const input = document.createElement('input');
      input.className = 'folder-rename-input';
      input.value = folder.name || 'Folder';
      input.onkeydown = async (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          await onStartRenameFolder?.commit(folder.id, input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          await onStartRenameFolder?.cancel();
        }
      };
      input.onblur = async () => {
        await onStartRenameFolder?.commit(folder.id, input.value);
      };
      input.onclick = (e) => {
        e.stopPropagation();
      };
      nameEl.appendChild(input);
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    } else {
      nameEl.innerHTML = escapeHtml(folder.name || 'Folder');
    }
    headerLeft.appendChild(nameEl);

    header.appendChild(headerLeft);

    const headerRight = document.createElement('span');
    headerRight.className = 'folder-header-right';

    headerRight.appendChild(
      buildMenu({
        ariaLabel: 'Folder actions',
        items: [
          {
            label: 'Move to…',
            icon: ICONS.folder,
            isSubmenu: true,
            onClick: () => {
              // Submenu handled by buildMenu
            }
          },
          {
            label: 'Rename',
            icon: ICONS.rename,
            onClick: () => {
              onStartRenameFolder?.begin(folder.id);
            }
          },
          {
            label: 'Delete',
            icon: ICONS.trash,
            isDanger: true,
            onClick: () => {
              onDeleteFolder?.(folder.id);
            }
          }
        ],
        getFoldersList: () => {
          const root = { label: 'Root', id: null, onClick: (targetFolderId) => {
            try {
              window.dispatchEvent(new CustomEvent('cc:moveFolder', { detail: { folderId: folder.id, targetFolderId } }));
            } catch {
              // ignore
            }
          } };
          return [root, ...getFoldersFlatLocal()
            .filter((f) => f.id !== folder.id)
            .map((f) => ({
              label: (f.depth ? `${'—'.repeat(Math.min(6, f.depth))} ` : '') + (f.name || 'Folder'),
              id: f.id,
              onClick: (targetFolderId) => {
                try {
                  window.dispatchEvent(new CustomEvent('cc:moveFolder', { detail: { folderId: folder.id, targetFolderId } }));
                } catch {
                  // ignore
                }
              }
            }))];
        }
      })
    );
    header.appendChild(headerRight);

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

      const chatIdTrimmed = (chat.id || '').toString().trim();

      const row = document.createElement('div');
      row.className = `folder-chat-item ${chat.id === activeChatId ? 'active' : ''}`;

      const isEditingChat = state.renamingId === chatIdTrimmed;

      if (!isEditingChat) {
        row.onclick = () => onOpenChat?.(chat.id);
      }
      row.draggable = true;
      row.ondragstart = (e) => {
        onDragStartChat?.(e, chat.id);
      };

      const name = document.createElement('div');
      name.className = 'folder-chat-name';

      if (isEditingChat) {
        const input = document.createElement('input');
        input.className = 'chat-rename-input';
        input.value = chatTitleFromMessages(chat);
        input.onkeydown = async (e) => {
          e.stopPropagation(); // Prevents bubbling to parent containers/buttons
          if (e.key === 'Enter') {
            e.preventDefault();
            await onStartRename?.commit(chatIdTrimmed, input.value);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            await onStartRename?.cancel();
          }
        };
        input.onblur = async () => {
          await onStartRename?.commit(chatIdTrimmed, input.value);
        };
        name.appendChild(input);
        requestAnimationFrame(() => input.focus());
      } else {
        name.textContent = chatTitleFromMessages(chat);
      }
      row.appendChild(name);

      row.appendChild(
        buildMenu({
          ariaLabel: 'Chat actions',
          items: [
            {
              label: 'Move to…',
              icon: ICONS.folder,
              isSubmenu: true,
              onClick: () => {
                // Submenu handled by buildMenu
              }
            },
            {
              label: 'Rename',
              icon: ICONS.rename,
              onClick: () => {
                onStartRename?.begin(chatIdTrimmed);
              }
            },
            {
              label: 'Delete',
              icon: ICONS.trash,
              isDanger: true,
              onClick: () => {
                try {
                  window.dispatchEvent(new CustomEvent('cc:trashChat', { detail: { chatId: chatIdTrimmed } }));
                } catch {
                  // ignore
                }
              }
            }
          ],
          getFoldersList: () => {
            const root = { label: 'Root', id: null, onClick: (folderId) => {
              try {
                window.dispatchEvent(new CustomEvent('cc:moveChatToFolder', { detail: { chatId: chatIdTrimmed, folderId } }));
              } catch {
                // ignore
              }
            } };
            return [root, ...getFoldersFlatLocal().map((f) => ({
              label: (f.depth ? `${'—'.repeat(Math.min(6, f.depth))} ` : '') + (f.name || 'Folder'),
              id: f.id,
              onClick: (folderId) => {
                try {
                  window.dispatchEvent(new CustomEvent('cc:moveChatToFolder', { detail: { chatId: chatIdTrimmed, folderId } }));
                } catch {
                  // ignore
                }
              }
            }))];
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
