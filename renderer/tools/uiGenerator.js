/**
 * Tool UI Generator
 * Dynamically generates UI elements for tool toggles based on available tools
 */

import { getAvailableTools } from './registry.js';
import { createToggle } from '../toggle.js';

/**
 * Generate tool toggle UI and attach to element
 * @param {HTMLElement} containerEl - Container to attach toggles to
 * @param {Object} state - App state
 * @param {Function} saveUIState - Save state callback
 * @param {Function} onToolToggle - Optional callback when any tool is toggled
 */
export function generateToolToggles(containerEl, state, saveUIState, onToolToggle) {
  if (!containerEl) return;

  const tools = getAvailableTools();
  containerEl.innerHTML = '';

  // Create a row for each tool
  for (const tool of tools) {
    const rowEl = document.createElement('div');
    rowEl.className = 'prompt-tools-row';
    rowEl.setAttribute('data-tool-id', tool.id);
    rowEl.style.marginBottom = '8px';

    const labelEl = document.createElement('div');
    labelEl.className = 'prompt-tools-label';
    labelEl.textContent = tool.name;

    const toggleContainerEl = document.createElement('div');

    // Create toggle using the existing createToggle function
    const isEnabled = tool.isEnabled(state);
    const toggleId = `tool-toggle-${tool.id}`;

    const toggle = createToggle({
      id: toggleId,
      text: '',
      checked: isEnabled,
      switchOnRight: true,
      showText: false,
      onChange: (checked) => {
        // Update state based on tool requirements
        // Tools may have different state keys
        if (tool.id === 'web_search' || tool.id === 'open_link') {
          state.enableInternet = checked;
        }

        saveUIState(state);
        onToolToggle?.(tool.id, checked);
      }
    });

    toggleContainerEl.appendChild(toggle.el);

    rowEl.appendChild(labelEl);
    rowEl.appendChild(toggleContainerEl);
    containerEl.appendChild(rowEl);
  }
}

/**
 * Get the HTML element ID for a tool's toggle container
 * Used when tools need to have a specific location in the UI
 * @param {string} toolId - The tool ID
 * @returns {string} HTML element ID
 */
export function getToolToggleContainerId(toolId) {
  return `tool-toggles-container-${toolId}`;
}

/**
 * Create a standalone toggle for a specific tool
 * @param {string} toolId - The tool ID
 * @param {Object} state - App state
 * @param {Function} saveUIState - Save state callback
 * @param {Function} onToggle - Callback when toggled
 * @returns {HTMLElement} Toggle element (the label with toggle inside)
 */
export function createToolToggle(toolId, state, saveUIState, onToggle) {
  const tools = getAvailableTools();
  const tool = tools.find(t => t.id === toolId);

  if (!tool) {
    throw new Error(`Tool "${toolId}" not found`);
  }

  const isEnabled = tool.isEnabled(state);
  const toggleId = `tool-toggle-${tool.id}-standalone`;

  const toggle = createToggle({
    id: toggleId,
    text: '',
    checked: isEnabled,
    switchOnRight: true,
    showText: false,
    onChange: (checked) => {
      if (tool.id === 'web_search' || tool.id === 'open_link') {
        state.enableInternet = checked;
      }

      saveUIState(state);
      onToggle?.(tool.id, checked);
    }
  });

  return toggle.el;
}
