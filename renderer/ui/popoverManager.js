/**
 * Popover management utilities for prompt tools and chat header tools
 */

export function createPopoverManager(els) {
  return {
    closePromptToolsPopover() {
      if (!els.promptToolsPopover || !els.promptToolsBtn) return;
      els.promptToolsPopover.classList.add('hidden');
      els.promptToolsBtn.setAttribute('aria-expanded', 'false');
    },

    togglePromptToolsPopover() {
      if (!els.promptToolsPopover || !els.promptToolsBtn) return;
      const isOpen = !els.promptToolsPopover.classList.contains('hidden');
      els.promptToolsPopover.classList.toggle('hidden', isOpen);
      els.promptToolsBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    },

    closeChatHeaderToolsPopover() {
      if (!els.chatHeaderToolsPopover || !els.chatHeaderToolsBtn) return;
      els.chatHeaderToolsPopover.classList.add('hidden');
      els.chatHeaderToolsBtn.setAttribute('aria-expanded', 'false');
    },

    toggleChatHeaderToolsPopover() {
      if (!els.chatHeaderToolsPopover || !els.chatHeaderToolsBtn) return;
      const isOpen = !els.chatHeaderToolsPopover.classList.contains('hidden');
      els.chatHeaderToolsPopover.classList.toggle('hidden', isOpen);
      els.chatHeaderToolsBtn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    }
  };
}
