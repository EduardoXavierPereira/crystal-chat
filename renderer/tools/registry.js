/**
 * Tools Registry and Manager
 * Handles tool registration, configuration, and orchestration
 */

import { webSearchTool } from './webSearch.js';
import { openLinkTool } from './openLink.js';

/**
 * List of all available tools
 * Each tool must export an object with: id, name, description, systemPrompt, execute
 */
const AVAILABLE_TOOLS = [
  webSearchTool,
  openLinkTool
];

/**
 * Get all available tools
 * @returns {Array} Array of tool definitions
 */
export function getAvailableTools() {
  return [...AVAILABLE_TOOLS];
}

/**
 * Get a tool by ID
 * @param {string} toolId - The tool ID
 * @returns {Object|null} The tool definition or null if not found
 */
export function getTool(toolId) {
  return AVAILABLE_TOOLS.find(t => t.id === toolId) || null;
}

/**
 * Get enabled tools based on state and filters
 * @param {Object} state - The app state
 * @param {Object} options - Options object
 * @param {Array<string>} options.includeTools - Only include specific tools (if provided)
 * @param {Array<string>} options.excludeTools - Exclude specific tools
 * @returns {Array} Array of enabled tool definitions
 */
export function getEnabledTools(state, options = {}) {
  const { includeTools, excludeTools = [] } = options;

  return AVAILABLE_TOOLS.filter(tool => {
    // Check include list if provided
    if (includeTools && !includeTools.includes(tool.id)) {
      return false;
    }

    // Check exclude list
    if (excludeTools.includes(tool.id)) {
      return false;
    }

    // Check if tool is enabled in state
    return tool.isEnabled(state);
  });
}

/**
 * Get combined system prompt instructions for all enabled tools
 * @param {Object} state - The app state
 * @param {Object} options - Options object
 * @returns {string} Combined system prompt instructions
 */
export function getToolsSystemPrompt(state, options = {}) {
  const enabledTools = getEnabledTools(state, options);

  if (enabledTools.length === 0) {
    return '';
  }

  let prompt = '';
  prompt += 'You MAY call tools if (and only if) the user enabled them in the UI.\n';
  prompt += 'When calling a tool, respond with ONLY a single line of JSON (no markdown, no extra text).\n';
  prompt += 'Tool call format:\n';
  prompt += '{"title":"<tool_id>","arguments":{...}}\n';
  prompt += '\n';

  // Add tool-specific instructions
  for (const tool of enabledTools) {
    if (tool.systemPrompt) {
      prompt += tool.systemPrompt + '\n';
    }
  }

  prompt += '\n';
  prompt += 'After a tool result is provided, you will be called again and should either call another tool (same JSON format) or respond normally.\n';
  prompt += 'When you respond normally after tools, DO NOT dump raw tool JSON or a bare link list.\n';
  prompt += 'Instead: write a short synthesized answer.\n';
  prompt += 'Rules:\n';
  prompt += '- Only call tools that are enabled when they\'re useful.\n';
  prompt += '- Keep queries concise.\n';
  prompt += 'Enabled tools:\n';

  for (const tool of enabledTools) {
    prompt += `- ${tool.id}: ${tool.description}\n`;
  }

  return prompt.trim();
}

/**
 * Parse a tool call from model output
 * @param {string} text - The model output text
 * @returns {Object|null} Parsed tool call {title, arguments} or null
 */
export function parseToolCall(text) {
  const rawAll = (text || '').toString();
  const raw = rawAll.trim();
  if (!raw) return null;
  if (raw.length > 8000) return null;

  // Be tolerant: some models may output JSON plus extra text.
  // Extract the first JSON object by finding the first balanced {...} block.
  const start = raw.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let end = -1;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;

  const jsonCandidate = raw.slice(start, end + 1).trim();
  if (!jsonCandidate.startsWith('{') || !jsonCandidate.endsWith('}')) return null;

  let j;
  try {
    j = JSON.parse(jsonCandidate);
  } catch {
    return null;
  }

  const title = j?.title;
  const arguments_ = j?.arguments;

  if (typeof title !== 'string') return null;
  if (typeof arguments_ !== 'object' || !arguments_) return null;

  // Verify tool exists
  if (!getTool(title)) return null;

  return { title, arguments: arguments_ };
}

/**
 * Execute a tool by ID
 * @param {string} toolId - The tool ID
 * @param {Object} args - Tool arguments
 * @returns {Promise<Object>} Tool result {success, message, data?, error?}
 */
export async function executeTool(toolId, args) {
  const tool = getTool(toolId);
  if (!tool) {
    return {
      success: false,
      message: `Tool "${toolId}" not found`
    };
  }

  try {
    return await tool.execute(args);
  } catch (error) {
    return {
      success: false,
      message: `Tool execution failed: ${error.message || 'Unknown error'}`
    };
  }
}

/**
 * Format tool result for display to user
 * @param {string} toolId - The tool ID
 * @param {Object} result - Tool execution result
 * @returns {string} User-facing text output
 */
export function formatToolResult(toolId, result) {
  const tool = getTool(toolId);
  if (!tool) {
    return 'Tool not found';
  }

  if (tool.formatResult) {
    return tool.formatResult(result);
  }

  // Default formatting
  if (result.success) {
    return result.message || 'Tool executed successfully';
  }
  return result.error || result.message || 'Tool execution failed';
}
