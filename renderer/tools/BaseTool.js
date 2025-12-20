/**
 * Base class for all tools
 * Provides common interface and utility methods
 */

export class BaseTool {
  /**
   * Tool identifier (must be unique)
   * @type {string}
   */
  id = '';

  /**
   * Human-readable tool name
   * @type {string}
   */
  name = '';

  /**
   * Short description of what the tool does
   * @type {string}
   */
  description = '';

  /**
   * System prompt instructions for the AI on how to use this tool
   * Should be specific and practical
   * @type {string}
   */
  systemPrompt = '';

  /**
   * Check if this tool is enabled based on app state
   * @param {Object} state - The app state
   * @returns {boolean} Whether the tool is enabled
   */
  isEnabled(state) {
    return true;
  }

  /**
   * Execute the tool with given arguments
   * Must be implemented by subclasses
   * @param {Object} args - Tool arguments
   * @returns {Promise<Object>} Result object {success: boolean, message: string, data?: any, error?: string}
   */
  async execute(args) {
    throw new Error('execute() must be implemented by subclass');
  }

  /**
   * Format tool result for user display
   * Can be overridden for custom formatting
   * @param {Object} result - Tool execution result
   * @returns {string} User-facing formatted text
   */
  formatResult(result) {
    if (result.success) {
      return result.message || 'Tool executed successfully';
    }
    return result.error || result.message || 'Tool execution failed';
  }

  /**
   * Validate tool arguments before execution
   * Can be overridden for custom validation
   * @param {Object} args - Arguments to validate
   * @throws {Error} If validation fails
   */
  validateArgs(args) {
    if (!args || typeof args !== 'object') {
      throw new Error('Arguments must be an object');
    }
  }
}
