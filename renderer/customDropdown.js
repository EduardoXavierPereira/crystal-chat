export function createCustomDropdown({
  rootEl,
  options,
  value,
  onChange,
  ariaLabel
}) {
  if (!rootEl) throw new Error('createCustomDropdown: missing rootEl');
  const opts = Array.isArray(options) ? options : [];

  let isOpen = false;
  let disabled = false;
  let currentValue = (value ?? '').toString();

  rootEl.innerHTML = '';
  rootEl.classList.add('cc-dropdown');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cc-dropdown-btn';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  if (ariaLabel) button.setAttribute('aria-label', ariaLabel);

  const buttonText = document.createElement('span');
  buttonText.className = 'cc-dropdown-btn-text';

  const chevron = document.createElement('span');
  chevron.className = 'cc-dropdown-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.textContent = '▾';

  button.appendChild(buttonText);
  button.appendChild(chevron);

  const menu = document.createElement('div');
  menu.className = 'cc-dropdown-menu hidden';
  menu.setAttribute('role', 'listbox');

  const items = opts.map((opt) => {
    const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'cc-dropdown-item';
    item.setAttribute('role', 'option');
    item.dataset.value = (o?.value ?? '').toString();
    item.textContent = (o?.label ?? o?.value ?? '').toString();
    item.addEventListener('click', () => {
      if (disabled) return;
      setValue(item.dataset.value || '');
      close();
      onChange?.(currentValue);
    });
    menu.appendChild(item);
    return item;
  });

  rootEl.appendChild(button);
  rootEl.appendChild(menu);

  function syncButton() {
    const found = opts.find((opt) => {
      const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
      return (o?.value ?? '').toString() === currentValue;
    });
    const label = found
      ? (typeof found === 'string' ? found : (found.label ?? found.value))
      : currentValue;

    buttonText.textContent = (label || '').toString();

    items.forEach((el) => {
      const active = (el.dataset.value || '') === currentValue;
      el.classList.toggle('active', active);
      el.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    button.disabled = disabled;
    rootEl.classList.toggle('disabled', disabled);
  }

  function open() {
    if (disabled) return;
    if (isOpen) return;
    isOpen = true;
    menu.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');

    // Keep the menu within the viewport to avoid creating page scroll.
    // Default: open downward.
    menu.style.top = 'calc(100% + 8px)';
    menu.style.bottom = '';

    const rect = button.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;

    const openUp = spaceBelow < 220 && spaceAbove > spaceBelow;
    if (openUp) {
      menu.style.top = 'auto';
      menu.style.bottom = 'calc(100% + 8px)';
    }

    const maxH = Math.max(140, Math.min(260, openUp ? spaceAbove : spaceBelow));
    menu.style.maxHeight = `${maxH}px`;
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    menu.classList.add('hidden');
    button.setAttribute('aria-expanded', 'false');
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  function setValue(next) {
    currentValue = (next ?? '').toString();
    syncButton();
  }

  function setDisabled(next) {
    disabled = !!next;
    if (disabled) close();
    syncButton();
  }

  function onDocClick(e) {
    if (!isOpen) return;
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (rootEl.contains(t)) return;
    close();
  }

  function onKeyDown(e) {
    if (disabled) return;
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      if (document.activeElement === button) {
        e.preventDefault();
        toggle();
      }
    }
  }

  button.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  });

  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKeyDown);

  // init
  if (!currentValue && opts[0]) {
    const o = typeof opts[0] === 'string' ? { value: opts[0], label: opts[0] } : opts[0];
    currentValue = (o?.value ?? '').toString();
  }
  syncButton();

  return {
    getValue: () => currentValue,
    setValue,
    setDisabled,
    close,
    open,
    destroy: () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
      rootEl.innerHTML = '';
    }
  };
}
