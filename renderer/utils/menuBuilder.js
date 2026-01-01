/**
 * SVG icons for menu items (shared across all menus)
 */
const ICONS = {
  folder: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8.2C3 7.07989 3 6.51984 3.21799 6.09202C3.40973 5.71569 3.71569 5.40973 4.09202 5.21799C4.51984 5 5.0799 5 6.2 5H9.67452C10.1637 5 10.4083 5 10.6385 5.05526C10.8425 5.10425 11.0376 5.18506 11.2166 5.29472C11.4184 5.4184 11.5914 5.59135 11.9373 5.93726L12.0627 6.06274C12.4086 6.40865 12.5816 6.5816 12.7834 6.70528C12.9624 6.81494 13.1575 6.89575 13.3615 6.94474C13.5917 7 13.8363 7 14.3255 7H17.8C18.9201 7 19.4802 7 19.908 7.21799C20.2843 7.40973 20.5903 7.71569 20.782 8.09202C21 8.51984 21 9.0799 21 10.2V15.8C21 16.9201 21 17.4802 20.782 17.908C20.5903 18.2843 20.2843 18.5903 19.908 18.782C19.4802 19 18.9201 19 17.8 19H6.2C5.07989 19 4.51984 19 4.09202 18.782C3.71569 18.5903 3.40973 18.2843 3.21799 17.908C3 17.4802 3 16.9201 3 15.8V8.2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  folderMinus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 8.2C3 7.07989 3 6.51984 3.21799 6.09202C3.40973 5.71569 3.71569 5.40973 4.09202 5.21799C4.51984 5 5.0799 5 6.2 5H9.67452C10.1637 5 10.4083 5 10.6385 5.05526C10.8425 5.10425 11.0376 5.18506 11.2166 5.29472C11.4184 5.4184 11.5914 5.59135 11.9373 5.93726L12.0627 6.06274C12.4086 6.40865 12.5816 6.5816 12.7834 6.70528C12.9624 6.81494 13.1575 6.89575 13.3615 6.94474C13.5917 7 13.8363 7 14.3255 7H17.8C18.9201 7 19.4802 7 19.908 7.21799C20.2843 7.40973 20.5903 7.71569 20.782 8.09202C21 8.51984 21 9.0799 21 10.2V15.8C21 16.9201 21 17.4802 20.782 17.908C20.5903 18.2843 20.2843 18.5903 19.908 18.782C19.4802 19 18.9201 19 17.8 19H6.2C5.07989 19 4.51984 19 4.09202 18.782C3.71569 18.5903 3.40973 18.2843 3.21799 17.908C3 17.4802 3 16.9201 3 15.8V8.2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 12h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  rename: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m14 6 2.293-2.293a1 1 0 0 1 1.414 0l2.586 2.586a1 1 0 0 1 0 1.414L18 10m-4-4-9.707 9.707a1 1 0 0 0-.293.707V19a1 1 0 0 0 1 1h2.586a1 1 0 0 0 .707-.293L18 10m-4-4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 6h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
};

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

/**
 * Build a 3-dot menu with "Move to…", "Rename", "Delete" (unified style)
 * Used consistently for all menus: chats and folders
 */
export function buildMenu({ ariaLabel, items, getFoldersList }) {
  const menuWrap = document.createElement('div');
  menuWrap.className = 'chat-menu-wrap';

  const menuBtn = document.createElement('button');
  menuBtn.className = 'chat-menu-btn';
  menuBtn.type = 'button';
  menuBtn.setAttribute('aria-label', ariaLabel);
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

  const createMenuItemButton = (label, icon, isDanger = false) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `chat-menu-item${isDanger ? ' danger' : ''}`;
    item.setAttribute('role', 'menuitem');
    item.innerHTML =
      `<span class="chat-menu-item-icon" aria-hidden="true">${icon}</span>` +
      `<span class="chat-menu-item-text">${label}</span>`;
    return item;
  };

  const buildMainMenu = () => {
    menu.innerHTML = '';
    items.forEach(({ label, icon, isDanger = false, isSubmenu = false, onClick = null }) => {
      if (isSubmenu) {
        const item = createMenuItemButton(label, icon);
        item.className = 'chat-menu-item has-submenu';
        item.setAttribute('aria-haspopup', 'menu');

        const chevron = document.createElement('span');
        chevron.className = 'chat-menu-item-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = '▸';
        item.appendChild(chevron);

        item.onclick = (e) => {
          e.stopPropagation();
          showSubmenu();
        };
        menu.appendChild(item);
      } else {
        const item = createMenuItemButton(label, icon, isDanger);
        item.onclick = (e) => {
          e.stopPropagation();
          onClick?.();
          closeMenu();
        };
        menu.appendChild(item);
      }
    });
  };

  const showSubmenu = () => {
    menu.innerHTML = '';

    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'chat-menu-item';
    back.setAttribute('role', 'menuitem');
    back.innerHTML = '<span class="chat-menu-item-text">← Back</span>';
    back.onclick = (e) => {
      e.stopPropagation();
      buildMainMenu();
    };
    menu.appendChild(back);

    const folders = getFoldersList?.() || [];
    folders.forEach(({ label, id, onClick: subOnClick }) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'chat-menu-item';
      item.setAttribute('role', 'menuitem');
      item.innerHTML = `<span class="chat-menu-item-text">${escapeHtml(label)}</span>`;
      item.onclick = (ev) => {
        ev.stopPropagation();
        subOnClick?.(id);
        closeMenu();
      };
      menu.appendChild(item);
    });
  };

  const openMenu = () => {
    if (cleanupMenuEvents) {
      cleanupMenuEvents();
      cleanupMenuEvents = null;
    }

    menu.classList.remove('hidden');
    buildMainMenu();
    menuBtn.classList.add('open');
    menuBtn.setAttribute('aria-expanded', 'true');

    const onDocClick = (ev) => {
      if (!menuWrap.contains(ev.target)) closeMenu();
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

  menuBtn.onclick = (e) => {
    e.stopPropagation();
    if (!menu.classList.contains('hidden')) closeMenu();
    else openMenu();
  };

  menu.onclick = (e) => {
    e.stopPropagation();
  };

  buildMainMenu();

  menuWrap.appendChild(menuBtn);
  menuWrap.appendChild(menu);
  return menuWrap;
}

export { ICONS, escapeHtml };
