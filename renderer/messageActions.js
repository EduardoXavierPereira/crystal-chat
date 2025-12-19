export function createCopyActionButton({ msg, messageIndex, onCopy } = {}) {
  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'message-action';
  copyBtn.innerHTML =
    '<span class="message-action-icon" aria-hidden="true">'
    + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" stroke-width="2"/>'
    + '<path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    + '</svg>'
    + '</span>'
    + '<span class="message-action-text">Copy</span>';
  copyBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onCopy?.(msg, messageIndex);

    const textEl = copyBtn.querySelector('.message-action-text');
    if (!textEl) return;
    textEl.textContent = 'Copied!';
    if (copyBtn._copiedTimer) {
      window.clearTimeout(copyBtn._copiedTimer);
    }
    copyBtn._copiedTimer = window.setTimeout(() => {
      textEl.textContent = 'Copy';
      copyBtn._copiedTimer = null;
    }, 1000);
  };
  return copyBtn;
}

export function createDeleteUserActionButton({ msg, messageIndex, onDeleteUserMessage } = {}) {
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'message-action danger';
  delBtn.innerHTML =
    '<span class="message-action-icon" aria-hidden="true">'
    + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    + '<path d="M10 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    + '<path d="M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    + '<path d="M6 7l1 14h10l1-14" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
    + '<path d="M9 7V4h6v3" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>'
    + '</svg>'
    + '</span>'
    + '<span class="message-action-text">Delete</span>';
  delBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onDeleteUserMessage?.(msg, messageIndex);
  };
  return delBtn;
}

export function createEditUserActionButton({ msg, messageIndex, onBeginEditUserMessage } = {}) {
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'message-action';
  editBtn.innerHTML =
    '<span class="message-action-icon" aria-hidden="true">'
    + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="m14 6 2.293-2.293a1 1 0 0 1 1.414 0l2.586 2.586a1 1 0 0 1 0 1.414L18 10m-4-4-9.707 9.707a1 1 0 0 0-.293.707V19a1 1 0 0 0 1 1h2.586a1 1 0 0 0 .707-.293L18 10m-4-4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
    + '</svg>'
    + '</span>'
    + '<span class="message-action-text">Edit</span>';
  editBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onBeginEditUserMessage?.(messageIndex, msg);
  };
  return editBtn;
}
