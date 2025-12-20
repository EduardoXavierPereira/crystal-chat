/**
 * File Write Tool
 * Write content to a file (creates or overwrites)
 */

import { BaseTool } from './BaseTool.js';

export class FileWriteTool extends BaseTool {
  id = 'file_write';
  name = 'Write File';
  description = 'Write or overwrite file contents';

  systemPrompt = `When using file_write, format: {"title":"file_write","arguments":{"path":"/absolute/path/file.js","content":"file content here"}}
Use file_write to:
- Create new files
- Overwrite existing files
- Save code, config, or documentation
Important: This OVERWRITES the entire file. Use file_edit for partial changes`;

  isEnabled(state) {
    return state.toolEnabled_file_write === true;
  }

  validateArgs(args) {
    super.validateArgs(args);
    if (!args.path || typeof args.path !== 'string') {
      throw new Error('Missing or invalid path argument');
    }
    if (!args.path.startsWith('/')) {
      throw new Error('Path must be absolute (start with /)');
    }
    if (typeof args.content !== 'string') {
      throw new Error('Missing or invalid content argument');
    }
  }

  async execute(args) {
    this.validateArgs(args);

    const api = window.electronAPI;
    if (!api || !api.fileWrite) {
      return {
        success: false,
        error: 'File system API unavailable'
      };
    }

    try {
      const result = await api.fileWrite(args.path, args.content);

      if (!result.ok) {
        return {
          success: false,
          error: result.error || 'Failed to write file'
        };
      }

      return {
        success: true,
        message: `Wrote ${args.content.length} bytes to ${args.path}`,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to write file: ${error.message}`
      };
    }
  }

  formatResult(result) {
    if (!result.success) {
      return `❌ ${result.error}`;
    }

    const data = result.data;
    return `✅ Successfully wrote to ${data.path || 'file'}`;
  }
}

export const fileWriteTool = new FileWriteTool();
