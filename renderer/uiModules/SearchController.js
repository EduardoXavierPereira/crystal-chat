/**
 * SearchController.js - In-chat search functionality
 * Implements Ctrl+F / Cmd+F style search with highlighting and navigation
 */

export class SearchController {
  constructor({ els, state, saveUIState, signal }) {
    this.els = els;
    this.state = state;
    this.saveUIState = saveUIState;
    this.signal = signal;

    this.isOpen = false;
    this.query = '';
    this.matches = [];
    this.currentMatchIndex = -1;

    this.attachListeners();
  }

  attachListeners() {
    // Hover to open/close search panel (like chat-header-tools)
    let hoverTimeout;

    const openOnHover = () => {
      hoverTimeout = setTimeout(() => {
        if (!this.isOpen) {
          this.openSearch();
        }
      }, 200);
    };

    const closeOnHoverLeave = () => {
      clearTimeout(hoverTimeout);
      // Close panel if mouse leaves button area
      if (this.isOpen) {
        hoverTimeout = setTimeout(() => {
          if (this.isOpen) {
            this.closeSearch();
          }
        }, 100);
      }
    };

    // Button hover events
    this.els.chatHeaderSearchBtn?.addEventListener('mouseenter', openOnHover, { signal: this.signal });
    this.els.chatHeaderSearchBtn?.addEventListener('mouseleave', closeOnHoverLeave, { signal: this.signal });

    // Panel hover events - keep open while hovering panel
    this.els.chatHeaderSearchPanel?.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimeout);
    }, { signal: this.signal });

    this.els.chatHeaderSearchPanel?.addEventListener('mouseleave', closeOnHoverLeave, { signal: this.signal });

    // Click on button acts like toggle (for accessibility and explicit control)
    this.els.chatHeaderSearchBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      clearTimeout(hoverTimeout);
      if (this.isOpen) {
        this.closeSearch();
      } else {
        this.openSearch();
      }
    }, { signal: this.signal });

    // Search input
    this.els.chatHeaderSearchInput?.addEventListener('input', (e) => {
      this.query = e.target.value || '';
      this.performSearch();
    }, { signal: this.signal });

    // Navigation buttons
    this.els.searchPrevBtn?.addEventListener('click', () => {
      this.goToPreviousMatch();
    }, { signal: this.signal });

    this.els.searchNextBtn?.addEventListener('click', () => {
      this.goToNextMatch();
    }, { signal: this.signal });

    // Enter key navigation
    this.els.chatHeaderSearchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          this.goToPreviousMatch();
        } else {
          this.goToNextMatch();
        }
      } else if (e.key === 'Escape') {
        this.closeSearch();
      }
    }, { signal: this.signal });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!this.isOpen) return;

      const panel = this.els.chatHeaderSearchPanel;
      const button = this.els.chatHeaderSearchBtn;

      if (!panel?.contains(e.target) && !button?.contains(e.target)) {
        this.closeSearch();
      }
    }, { signal: this.signal, capture: true });
  }

  toggleSearchPanel() {
    if (this.isOpen) {
      this.closeSearch();
    } else {
      this.openSearch();
    }
  }

  openSearch() {
    this.isOpen = true;

    // Update UI
    this.els.chatHeaderSearchPanel?.classList.remove('hidden');
    this.els.chatHeaderSearchBtn?.setAttribute('aria-expanded', 'true');

    // Focus input
    this.els.chatHeaderSearchInput?.focus();
    this.els.chatHeaderSearchInput?.select();
  }

  closeSearch() {
    this.isOpen = false;

    // Clear highlights
    this.clearHighlights();

    // Update UI
    this.els.chatHeaderSearchPanel?.classList.add('hidden');
    this.els.chatHeaderSearchBtn?.setAttribute('aria-expanded', 'false');

    // Reset state
    this.query = '';
    this.matches = [];
    this.currentMatchIndex = -1;

    if (this.els.chatHeaderSearchInput) {
      this.els.chatHeaderSearchInput.value = '';
    }

    // Clear match count display
    if (this.els.searchMatchCount) {
      this.els.searchMatchCount.textContent = '';
    }
  }

  clearSearch() {
    this.query = '';
    this.matches = [];
    this.currentMatchIndex = -1;

    if (this.els.chatHeaderSearchInput) {
      this.els.chatHeaderSearchInput.value = '';
    }

    this.clearHighlights();
    this.updateUI();
  }

  performSearch() {
    // Clear previous highlights
    this.clearHighlights();
    this.matches = [];
    this.currentMatchIndex = -1;

    // If query is empty, just update UI
    if (!this.query.trim()) {
      this.updateUI();
      return;
    }

    // Get searchable container
    const container = this.els.messagesEl;
    if (!container) {
      this.updateUI();
      return;
    }

    // Find all text nodes and highlight matches
    this.highlightMatches(container);

    // Navigate to first match
    if (this.matches.length > 0) {
      this.currentMatchIndex = 0;
      this.scrollToCurrentMatch();
    }

    // Debug logging
    console.log(`[Search] Found ${this.matches.length} matches for query: "${this.query}"`);

    this.updateUI();
  }

  highlightMatches(container) {
    const query = this.query.toLowerCase();

    console.log(`[Search] Starting search in container:`, container);

    // Get all message content elements
    const messageElements = container.querySelectorAll('.message-content');

    console.log(`[Search] Found ${messageElements.length} message content elements`);

    // If no message elements, search the entire container (fallback for home screen)
    if (messageElements.length === 0) {
      console.log(`[Search] No message elements found, searching entire container`);
      this.highlightInElement(container, query);
    } else {
      messageElements.forEach((messageEl) => {
        this.highlightInElement(messageEl, query);
      });
    }

    // Also search in home screen widgets if visible
    const homeLayout = container.querySelector('.home-layout');
    if (homeLayout) {
      console.log(`[Search] Searching home layout`);
      this.highlightInElement(homeLayout, query);
    }
  }

  highlightInElement(element, query) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // Skip if parent is a script, style, or already highlighted
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          const tagName = parent.tagName.toLowerCase();
          if (tagName === 'script' || tagName === 'style' || tagName === 'mark') {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip empty or whitespace-only nodes
          if (!node.textContent || !node.textContent.trim()) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    // Process text nodes
    textNodes.forEach((textNode) => {
      const text = textNode.textContent;
      const textLower = text.toLowerCase();

      let startIndex = 0;
      let matchIndex;

      const ranges = [];

      while ((matchIndex = textLower.indexOf(query, startIndex)) !== -1) {
        ranges.push({
          start: matchIndex,
          end: matchIndex + query.length
        });
        startIndex = matchIndex + 1;
      }

      if (ranges.length === 0) return;

      // Split text node and wrap matches in <mark> elements
      const parent = textNode.parentNode;
      const fragment = document.createDocumentFragment();

      let lastEnd = 0;

      ranges.forEach((range) => {
        // Add text before match
        if (range.start > lastEnd) {
          fragment.appendChild(
            document.createTextNode(text.substring(lastEnd, range.start))
          );
        }

        // Add highlighted match
        const mark = document.createElement('mark');
        mark.className = 'search-highlight';
        mark.textContent = text.substring(range.start, range.end);
        fragment.appendChild(mark);

        this.matches.push({
          element: mark,
          messageElement: textNode.parentElement?.closest?.('.message'),
          homeWidget: textNode.parentElement?.closest?.('.home-widget')
        });

        lastEnd = range.end;
      });

      // Add remaining text
      if (lastEnd < text.length) {
        fragment.appendChild(
          document.createTextNode(text.substring(lastEnd))
        );
      }

      parent.replaceChild(fragment, textNode);
    });
  }

  clearHighlights() {
    const highlights = document.querySelectorAll('mark.search-highlight');
    highlights.forEach((mark) => {
      const text = mark.textContent;
      const textNode = document.createTextNode(text);
      mark.parentNode.replaceChild(textNode, mark);
    });

    // Normalize text nodes to merge adjacent ones
    const container = this.els.messagesEl;
    if (container) {
      container.normalize();
    }
  }

  goToNextMatch() {
    if (this.matches.length === 0) return;

    this.currentMatchIndex = (this.currentMatchIndex + 1) % this.matches.length;
    this.scrollToCurrentMatch();
    this.updateUI();
  }

  goToPreviousMatch() {
    if (this.matches.length === 0) return;

    this.currentMatchIndex = (this.currentMatchIndex - 1 + this.matches.length) % this.matches.length;
    this.scrollToCurrentMatch();
    this.updateUI();
  }

  scrollToCurrentMatch() {
    if (this.currentMatchIndex < 0 || this.currentMatchIndex >= this.matches.length) {
      return;
    }

    const match = this.matches[this.currentMatchIndex];

    // Remove previous current highlight
    document.querySelectorAll('mark.search-highlight-current').forEach((el) => {
      el.classList.remove('search-highlight-current');
    });

    // Add current highlight
    match.element.classList.add('search-highlight-current');

    // Scroll to match
    match.element.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }

  updateUI() {
    // Update match count
    if (this.els.searchMatchCount) {
      if (this.matches.length === 0) {
        this.els.searchMatchCount.textContent = this.query ? 'No matches' : '';
      } else {
        this.els.searchMatchCount.textContent =
          `${this.currentMatchIndex + 1} of ${this.matches.length}`;
      }
    }

    // Update navigation buttons
    const hasMatches = this.matches.length > 0;

    if (this.els.searchPrevBtn) {
      this.els.searchPrevBtn.disabled = !hasMatches;
    }

    if (this.els.searchNextBtn) {
      this.els.searchNextBtn.disabled = !hasMatches;
    }
  }

  // Public method to refresh search after chat re-render
  refreshSearch() {
    if (this.isOpen && this.query) {
      this.performSearch();
    }
  }
}
