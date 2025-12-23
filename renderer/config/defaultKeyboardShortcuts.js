/**
 * Default keyboard shortcuts configuration
 * Mod = Ctrl on Windows/Linux, Cmd on macOS
 */

export const DEFAULT_SHORTCUTS = {
  goToHome: {
    id: 'goToHome',
    label: 'Go to Home',
    description: 'Return to the home screen',
    defaultKeys: ['Mod+Shift+H'],
    category: 'navigation',
    action: 'focus:home'
  },

  focusInput: {
    id: 'focusInput',
    label: 'Focus Chat Input',
    description: 'Jump to the message input field',
    defaultKeys: ['Mod+L'],
    category: 'navigation',
    action: 'focus:promptInput'
  },

  openHistory: {
    id: 'openHistory',
    label: 'Open History',
    description: 'Switch to the history/sidebar view',
    defaultKeys: ['Mod+H'],
    category: 'navigation',
    action: 'focus:sidebar'
  },

  openMemories: {
    id: 'openMemories',
    label: 'Open Memories',
    description: 'Switch to the memories view',
    defaultKeys: ['Mod+M'],
    category: 'navigation',
    action: 'focus:memories'
  },

  openTrash: {
    id: 'openTrash',
    label: 'Open Trash',
    description: 'Switch to the trash view',
    defaultKeys: ['Mod+T'],
    category: 'navigation',
    action: 'focus:trash'
  },

  openSettings: {
    id: 'openSettings',
    label: 'Open Settings',
    description: 'Open the settings panel',
    defaultKeys: ['Mod+,'],
    category: 'navigation',
    action: 'focus:settings'
  },

  pauseAI: {
    id: 'pauseAI',
    label: 'Pause AI',
    description: 'Stop AI response generation',
    defaultKeys: ['Mod+P'],
    category: 'ai',
    action: 'streaming:abort',
    enabledWhen: 'isStreaming'
  }
};

export const SHORTCUT_CATEGORIES = {
  navigation: { label: 'Navigation', order: 1 },
  ai: { label: 'AI Control', order: 2 }
};
