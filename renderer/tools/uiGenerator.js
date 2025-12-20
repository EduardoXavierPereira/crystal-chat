/**
 * Tool UI Generator
 * Dynamically generates UI elements for tool toggles based on available tools
 */

import { getAvailableTools } from './registry.js';
import { createToggle } from '../toggle.js';

/**
 * Categorize tools into groups
 */
function categorizeTools(tools) {
  const categories = {
    'Internet Access': [],
    'File System': []
  };

  for (const tool of tools) {
    if (tool.id === 'web_search' || tool.id === 'open_link') {
      categories['Internet Access'].push(tool);
    } else if (tool.id.startsWith('file_')) {
      categories['File System'].push(tool);
    }
  }

  return categories;
}

/**
 * Create a collapsible category section
 */
function createCategorySection(categoryName, tools, state, saveUIState, onToolToggle, startClosed = true) {
  const categoryEl = document.createElement('div');
  categoryEl.className = 'tools-category';
  categoryEl.style.marginBottom = '8px';

  // Category header (collapsible)
  const headerEl = document.createElement('div');
  headerEl.className = 'tools-category-header';
  headerEl.style.display = 'flex';
  headerEl.style.alignItems = 'center';
  headerEl.style.cursor = 'pointer';
  headerEl.style.userSelect = 'none';
  headerEl.style.padding = '6px 0';
  headerEl.style.fontWeight = '500';
  headerEl.style.fontSize = '13px';

  const chevronEl = document.createElement('span');
  chevronEl.textContent = '▶';
  chevronEl.style.marginRight = '6px';
  chevronEl.style.display = 'inline-block';
  chevronEl.style.transition = 'transform 0.2s';
  chevronEl.style.fontSize = '10px';
  chevronEl.style.width = '12px';

  const titleEl = document.createElement('span');
  titleEl.textContent = categoryName;

  headerEl.appendChild(chevronEl);
  headerEl.appendChild(titleEl);

  // Category content (tools)
  const contentEl = document.createElement('div');
  contentEl.className = 'tools-category-content';
  contentEl.style.paddingLeft = '16px';
  contentEl.style.maxHeight = startClosed ? '0' : '500px';
  contentEl.style.overflow = 'hidden';
  contentEl.style.transition = 'max-height 0.2s ease-out';

  // Add tools to content
  for (const tool of tools) {
    const rowEl = document.createElement('div');
    rowEl.className = 'prompt-tools-row';
    rowEl.setAttribute('data-tool-id', tool.id);
    rowEl.style.marginBottom = '6px';

    const labelEl = document.createElement('div');
    labelEl.className = 'prompt-tools-label';
    labelEl.textContent = tool.name;
    labelEl.style.fontSize = '12px';

    const toggleContainerEl = document.createElement('div');

    const isEnabled = tool.isEnabled(state);
    const toggleId = `tool-toggle-${tool.id}`;

    const toggle = createToggle({
      id: toggleId,
      text: '',
      checked: isEnabled,
      switchOnRight: true,
      showText: false,
      onChange: (checked) => {
        // Store individual tool state
        const stateKey = `toolEnabled_${tool.id}`;
        state[stateKey] = checked;

        saveUIState(state);
        onToolToggle?.(tool.id, checked);
      }
    });

    toggleContainerEl.appendChild(toggle.el);
    rowEl.appendChild(labelEl);
    rowEl.appendChild(toggleContainerEl);
    contentEl.appendChild(rowEl);
  }

  categoryEl.appendChild(headerEl);
  categoryEl.appendChild(contentEl);

  // Toggle expand/collapse
  let isExpanded = !startClosed;
  headerEl.addEventListener('click', () => {
    isExpanded = !isExpanded;
    contentEl.style.maxHeight = isExpanded ? '500px' : '0';
    chevronEl.style.transform = isExpanded ? 'rotate(90deg)' : 'rotate(0deg)';
  });

  return categoryEl;
}

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

  const categories = categorizeTools(tools);

  // Create main "Tools" category
  const toolsEl = document.createElement('div');
  toolsEl.className = 'tools-category';
  toolsEl.style.marginBottom = '8px';

  // Tools header (collapsible)
  const toolsHeaderEl = document.createElement('div');
  toolsHeaderEl.className = 'tools-category-header';
  toolsHeaderEl.style.display = 'flex';
  toolsHeaderEl.style.alignItems = 'center';
  toolsHeaderEl.style.cursor = 'pointer';
  toolsHeaderEl.style.userSelect = 'none';
  toolsHeaderEl.style.padding = '6px 0';
  toolsHeaderEl.style.fontWeight = '600';
  toolsHeaderEl.style.fontSize = '13px';

  const toolsChevronEl = document.createElement('span');
  toolsChevronEl.textContent = '▶';
  toolsChevronEl.style.marginRight = '6px';
  toolsChevronEl.style.display = 'inline-block';
  toolsChevronEl.style.transition = 'transform 0.2s';
  toolsChevronEl.style.fontSize = '10px';
  toolsChevronEl.style.width = '12px';

  const toolsTitleEl = document.createElement('span');
  toolsTitleEl.textContent = 'Tools';

  toolsHeaderEl.appendChild(toolsChevronEl);
  toolsHeaderEl.appendChild(toolsTitleEl);

  // Tools content (subcategories)
  const toolsContentEl = document.createElement('div');
  toolsContentEl.className = 'tools-main-content';
  toolsContentEl.style.paddingLeft = '8px';
  toolsContentEl.style.maxHeight = '0';
  toolsContentEl.style.overflow = 'hidden';
  toolsContentEl.style.transition = 'max-height 0.2s ease-out';

  // Add subcategories to Tools
  for (const [categoryName, categoryTools] of Object.entries(categories)) {
    if (categoryTools.length === 0) continue;
    const subCategoryEl = createCategorySection(categoryName, categoryTools, state, saveUIState, onToolToggle, true);
    toolsContentEl.appendChild(subCategoryEl);
  }

  toolsEl.appendChild(toolsHeaderEl);
  toolsEl.appendChild(toolsContentEl);
  containerEl.appendChild(toolsEl);

  // Toggle expand/collapse for main Tools section
  let isToolsExpanded = false;
  toolsHeaderEl.addEventListener('click', () => {
    isToolsExpanded = !isToolsExpanded;
    toolsContentEl.style.maxHeight = isToolsExpanded ? '500px' : '0';
    toolsChevronEl.style.transform = isToolsExpanded ? 'rotate(90deg)' : 'rotate(0deg)';
  });
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
