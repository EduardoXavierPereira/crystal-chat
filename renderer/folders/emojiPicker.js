/**
 * Emoji picker UI for folder creation modal
 * Self-contained widget that manages emoji selection
 */

const EMOJI_BANK = [
  { e: '📁', tags: ['folder', 'files', 'yellow'] },
  { e: '📂', tags: ['folder', 'open', 'files'] },
  { e: '🧰', tags: ['tools', 'kit', 'projects'] },
  { e: '🔧', tags: ['tool', 'fix', 'wrench'] },
  { e: '🔨', tags: ['tool', 'build'] },
  { e: '🔩', tags: ['hardware', 'bolt'] },
  { e: '📌', tags: ['pin', 'important'] },
  { e: '📍', tags: ['pin', 'location'] },
  { e: '🔖', tags: ['tag', 'bookmark'] },
  { e: '📎', tags: ['clip', 'attachments'] },
  { e: '🧷', tags: ['pin', 'safety'] },
  { e: '📑', tags: ['tabs', 'docs'] },
  { e: '📒', tags: ['notebook', 'notes'] },
  { e: '📓', tags: ['notebook', 'drafts'] },
  { e: '📔', tags: ['notebook', 'journal'] },
  { e: '📕', tags: ['book', 'read'] },
  { e: '📗', tags: ['book', 'green'] },
  { e: '📘', tags: ['book', 'blue'] },
  { e: '📙', tags: ['book', 'orange'] },
  { e: '📚', tags: ['library', 'reading'] },
  { e: '📇', tags: ['index', 'cards'] },
  { e: '📄', tags: ['doc', 'file'] },
  { e: '📃', tags: ['doc', 'draft'] },
  { e: '📰', tags: ['news', 'read'] },
  { e: '💼', tags: ['work', 'business'] },
  { e: '🧳', tags: ['travel', 'packing'] },
  { e: '🧭', tags: ['direction', 'plan'] },
  { e: '🧾', tags: ['receipts', 'finance'] },
  { e: '🪙', tags: ['coins', 'money'] },
  { e: '📦', tags: ['archive', 'box'] },
  { e: '🪜', tags: ['ladder', 'backlog'] },
  { e: '📅', tags: ['calendar', 'date'] },
  { e: '📆', tags: ['calendar', 'schedule'] },
  { e: '⏰', tags: ['alarm', 'time'] },
  { e: '🔒', tags: ['locked', 'private'] },
  { e: '🔓', tags: ['unlocked', 'shared'] },
  { e: '🔐', tags: ['secure', 'vault'] },
  { e: '🔑', tags: ['key', 'access'] },
  { e: '💡', tags: ['ideas', 'inspiration'] },
  { e: '🔦', tags: ['review', 'spotlight'] },
  { e: '⭐', tags: ['favorite', 'star'] },
  { e: '🌟', tags: ['highlight', 'star'] },
  { e: '✨', tags: ['spark', 'new'] },
  { e: '🌙', tags: ['night', 'focus'] },
  { e: '🔥', tags: ['hot', 'priority'] },
  { e: '💧', tags: ['water', 'cooling'] },
  { e: '🌊', tags: ['waves', 'ideas'] },
  { e: '🌲', tags: ['nature', 'green'] },
  { e: '🌳', tags: ['trees', 'green'] },
  { e: '🌿', tags: ['herb', 'green'] },
  { e: '🍀', tags: ['luck', 'green'] },
  { e: '🌸', tags: ['pink', 'spring'] },
  { e: '🎯', tags: ['target', 'goals'] },
  { e: '🎫', tags: ['tickets', 'events'] },
  { e: '🏁', tags: ['done', 'finish'] },
  { e: '🚩', tags: ['flag', 'alert'] },
  { e: '🪧', tags: ['sign', 'notice'] },
  { e: '🔴', tags: ['red', 'priority'] },
  { e: '🟠', tags: ['orange', 'in-progress'] },
  { e: '🟡', tags: ['yellow', 'pending'] },
  { e: '🟢', tags: ['green', 'go'] },
  { e: '🔵', tags: ['blue'] },
  { e: '🟣', tags: ['purple'] },
  { e: '🟤', tags: ['brown'] },
  { e: '🟥', tags: ['red', 'square'] },
  { e: '🟧', tags: ['orange', 'square'] },
  { e: '🟨', tags: ['yellow', 'square'] },
  { e: '🟩', tags: ['green', 'square'] },
  { e: '🟦', tags: ['blue', 'square'] },
  { e: '🟪', tags: ['purple', 'square'] },
  { e: '🟫', tags: ['brown', 'square'] },
  { e: '⚪', tags: ['white', 'circle'] },
  { e: '⚫', tags: ['black', 'circle'] },
  { e: '🔶', tags: ['orange', 'diamond'] },
  { e: '🔷', tags: ['blue', 'diamond'] },
  { e: '💬', tags: ['chat', 'speech'] },
  { e: '💭', tags: ['thought', 'idea'] },
  { e: '📝', tags: ['notes', 'todo'] },
  { e: '🏠', tags: ['home', 'personal'] },
  { e: '🏢', tags: ['office', 'work'] },
  { e: '🏭', tags: ['factory', 'ops'] },
  { e: '🏪', tags: ['shop', 'store'] },
  { e: '🏥', tags: ['health', 'med'] },
  { e: '🏦', tags: ['bank', 'finance'] },
  { e: '💻', tags: ['code', 'dev'] },
  { e: '📱', tags: ['mobile'] },
  { e: '📲', tags: ['mobile', 'sync'] },
  { e: '💾', tags: ['save', 'storage'] },
  { e: '💿', tags: ['disc', 'media'] },
  { e: '📀', tags: ['disc', 'media'] },
  { e: '🎮', tags: ['games', 'fun'] },
  { e: '🎵', tags: ['music', 'audio'] },
  { e: '🎶', tags: ['music'] },
  { e: '🎧', tags: ['audio', 'headphones'] },
  { e: '🎤', tags: ['mic', 'record'] },
  { e: '🎬', tags: ['video', 'media'] },
  { e: '📷', tags: ['photo'] },
  { e: '📸', tags: ['photo'] },
  { e: '🎨', tags: ['design', 'art'] },
  { e: '🧪', tags: ['lab', 'science'] },
  { e: '🔬', tags: ['research', 'science'] },
  { e: '🔭', tags: ['space', 'research'] },
  { e: '📡', tags: ['radio', 'signal'] },
  { e: '🏆', tags: ['trophy', 'wins'] },
  { e: '❤️', tags: ['red', 'heart'] },
  { e: '🧡', tags: ['orange', 'heart'] },
  { e: '💛', tags: ['yellow', 'heart'] },
  { e: '💚', tags: ['green', 'heart'] },
  { e: '💙', tags: ['blue', 'heart'] },
  { e: '💜', tags: ['purple', 'heart'] },
  { e: '🖤', tags: ['black', 'heart'] },
  { e: '🤍', tags: ['white', 'heart'] },
  { e: '✅', tags: ['done', 'complete'] },
  { e: '❌', tags: ['remove', 'delete'] },
  { e: '❓', tags: ['question'] },
  { e: '❗', tags: ['alert'] },
  { e: '💯', tags: ['top', 'quality'] },
  { e: '🆕', tags: ['new'] },
  { e: '🆗', tags: ['ok'] },
  { e: '🍎', tags: ['apple', 'red'] },
  { e: '🍊', tags: ['orange', 'fruit'] },
  { e: '🍋', tags: ['yellow', 'fruit'] },
  { e: '🍏', tags: ['green', 'fruit'] },
  { e: '🍇', tags: ['purple', 'fruit'] },
  { e: '🍓', tags: ['red', 'fruit'] },
  { e: '🥝', tags: ['green', 'fruit'] },
  { e: '🥑', tags: ['green', 'fruit'] },
  { e: '🌈', tags: ['rainbow'] },
  { e: '🚲', tags: ['bike'] },
  { e: '⛵', tags: ['boat'] },
  { e: '🚂', tags: ['train'] },
  { e: '🛸', tags: ['ufo', 'fun'] },
  { e: '🎪', tags: ['event', 'fun'] },
  // --- COMMUNICATION & NOTIFICATIONS ---
  { e: '📧', tags: ['email', 'mail', 'inbox'] },
  { e: '📨', tags: ['mail', 'sent', 'incoming'] },
  { e: '🔔', tags: ['notification', 'alert', 'bell'] },
  { e: '🔕', tags: ['mute', 'silent', 'notifications'] },
  { e: '📣', tags: ['announcement', 'megaphone', 'broadcast'] },
  { e: '📢', tags: ['loudspeaker', 'alert'] },
  { e: '🗣️', tags: ['speaking', 'discussion', 'voice'] },
  // --- DATA & ANALYTICS ---
  { e: '📈', tags: ['growth', 'stats', 'trending'] },
  { e: '📉', tags: ['loss', 'stats', 'down'] },
  { e: '📊', tags: ['chart', 'data', 'analytics'] },
  { e: '🔍', tags: ['search', 'find', 'glass'] },
  { e: '🔎', tags: ['search', 'details', 'zoom'] },
  { e: '🧮', tags: ['math', 'calculation', 'abacus'] },

  // --- TIME & STATUS ---
  { e: '⌛', tags: ['waiting', 'sand', 'timer'] },
  { e: '⏳', tags: ['loading', 'progress', 'timer'] },
  { e: '⏱️', tags: ['stopwatch', 'fast', 'timer'] },
  { e: '⏲️', tags: ['timer', 'clock', 'limit'] },
  { e: '💤', tags: ['sleep', 'inactive', 'idle'] },
  { e: '🚧', tags: ['construction', 'maintenance', 'building'] },
  { e: '🛑', tags: ['stop', 'halt', 'error'] },

  // --- HARDWARE & OFFICE ---
  { e: '⌨️', tags: ['keyboard', 'typing', 'input'] },
  { e: '🖱️', tags: ['mouse', 'click', 'computer'] },
  { e: '🖨️', tags: ['print', 'hardware', 'office'] },
  { e: '🖥️', tags: ['monitor', 'screen', 'desktop'] },
  { e: '🔋', tags: ['battery', 'power', 'energy'] },
  { e: '🔌', tags: ['plug', 'power', 'connect'] },
  { e: '🕯️', tags: ['candle', 'legacy', 'light'] },

  // --- PEOPLE & SOCIAL ---
  { e: '👤', tags: ['user', 'profile', 'person'] },
  { e: '👥', tags: ['team', 'users', 'group'] },
  { e: '🤝', tags: ['partnership', 'deal', 'agreement'] },
  { e: '🫂', tags: ['support', 'community', 'embrace'] },
  { e: '🙋', tags: ['question', 'volunteer', 'person'] },

  // --- NAVIGATION & SYMBOLS ---
  { e: '🔄', tags: ['sync', 'refresh', 'update'] },
  { e: '🔃', tags: ['reload', 'cycle', 'repeat'] },
  { e: '➡️', tags: ['next', 'arrow', 'right'] },
  { e: '⬅️', tags: ['back', 'arrow', 'left'] },
  { e: '⬆️', tags: ['up', 'top', 'priority'] },
  { e: '⬇️', tags: ['down', 'bottom', 'low'] },
  { e: '➕', tags: ['add', 'plus', 'new'] },
  { e: '➖', tags: ['minus', 'remove', 'less'] },
  { e: '♾️', tags: ['infinity', 'forever', 'loop'] },

  // --- WEATHER & ENVIRONMENT ---
  { e: '☀️', tags: ['sun', 'bright', 'day'] },
  { e: '☁️', tags: ['cloud', 'weather', 'storage'] },
  { e: '⛈️', tags: ['storm', 'bugs', 'problem'] },
  { e: '❄️', tags: ['cold', 'winter', 'frozen'] },
  { e: '⚡', tags: ['fast', 'flash', 'energy'] },
  { e: '🌬️', tags: ['wind', 'air', 'speed'] },

  // --- FOOD & BREAKS ---
  { e: '☕', tags: ['coffee', 'break', 'morning'] },
  { e: '🍵', tags: ['tea', 'relax', 'hot'] },
  { e: '🥤', tags: ['drink', 'soda', 'refreshment'] },
  { e: '🥪', tags: ['lunch', 'food', 'snack'] },
  { e: '🍕', tags: ['pizza', 'party', 'food'] },
  { e: '🍦', tags: ['treat', 'dessert', 'icecream'] },

  // --- ANIMALS (THEMATIC) ---
  { e: '🦋', tags: ['butterfly', 'design', 'change'] },
  { e: '🐝', tags: ['busy', 'work', 'bee'] },
  { e: '🐜', tags: ['bug', 'error', 'tiny'] },
  { e: '🦉', tags: ['wisdom', 'knowledge', 'night'] },
  { e: '🦄', tags: ['special', 'rare', 'magic'] },

  // --- ADDITIONAL OBJECTS ---
  { e: '🎁', tags: ['gift', 'reward', 'bonus'] },
  { e: '💡', tags: ['idea', 'light', 'discovery'] },
  { e: '🔦', tags: ['flashlight', 'debug', 'investigate'] },
  { e: '🎈', tags: ['celebration', 'launch', 'fun'] },
  { e: '🧸', tags: ['comfort', 'testing', 'toy'] },
  { e: '💎', tags: ['gem', 'valuable', 'premium', 'crystal'] }
];

/**
 * Create an emoji picker widget
 * @param {Object} els - DOM elements {folderEmojiPickerEl, folderEmojiSearchEl}
 * @returns {Object} API {buildPicker, getSelected, resetSelection}
 */
export function createEmojiPicker({ els }) {
  let selectedEmoji = '';
  let emojiPickerReady = false;

  function buildEmojiPicker(query = '') {
    if (!els.folderEmojiPickerEl) return;
    const picker = els.folderEmojiPickerEl;
    picker.innerHTML = '';

    const rawQuery = (query || '').toString().trim();
    const searchQuery = rawQuery.toLowerCase();

    const items = EMOJI_BANK.map((entry) =>
      typeof entry === 'string' ? { e: entry, tags: [] } : entry || { e: '', tags: [] }
    );

    const filtered = items.filter(({ e, tags }) => {
      if (!e) return false;
      if (e.includes('‍') || e.includes('️')) return false; // skip multi-emoji/ZWJ/VS combos
      if (Array.from(e).length !== 1) return false;
      if (!searchQuery) return true;
      const haystack = [e.toLowerCase(), ...(Array.isArray(tags) ? tags.map((t) => (t || '').toLowerCase()) : [])];
      return haystack.some((t) => t.includes(searchQuery));
    });

    if (picker.dataset.query !== rawQuery) {
      picker.dataset.query = rawQuery;
    }

    filtered.forEach(({ e: emoji }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `emoji-btn ${emoji === selectedEmoji ? 'selected' : ''}`;
      btn.setAttribute('role', 'option');
      btn.textContent = emoji;
      btn.onclick = (e) => {
        e.preventDefault();
        selectedEmoji = emoji;
        buildEmojiPicker(rawQuery);
      };
      picker.appendChild(btn);
    });

    emojiPickerReady = true;
  }

  return {
    buildPicker: buildEmojiPicker,
    getSelected: () => selectedEmoji,
    resetSelection: () => {
      selectedEmoji = '';
      emojiPickerReady = false;
    },
    isReady: () => emojiPickerReady,
    setReady: (val) => {
      emojiPickerReady = val;
    }
  };
}
