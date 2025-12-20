/**
 * File Read Tool
 * Read file contents with optional line offset and limit
 */

import { BaseTool } from './BaseTool.js';

export class FileReadTool extends BaseTool {
  id = 'file_read';
  name = 'Read File';
  description = 'Read contents of a file with optional line range';

  systemPrompt = `When using file_read, format: {"title":"file_read","arguments":{"path":"/absolute/path/to/file.js"}}
Optional arguments:
- offset: Line number to start reading from (1-indexed)
- limit: Maximum number of lines to read
Examples:
- {"title":"file_read","arguments":{"path":"/path/file.js"}} - Read entire file
- {"title":"file_read","arguments":{"path":"/path/file.js","offset":10,"limit":20}} - Read lines 10-29
Use file_read to understand code, check implementations, and examine file contents`;

  isEnabled(state) {
    return state.toolEnabled_file_read === true;
  }

  validateArgs(args) {
    super.validateArgs(args);
    if (!args.path || typeof args.path !== 'string') {
      throw new Error('Missing or invalid path argument');
    }
    if (!args.path.startsWith('/')) {
      throw new Error('Path must be absolute (start with /)');
    }
    if (args.offset && (typeof args.offset !== 'number' || args.offset < 1)) {
      throw new Error('Offset must be a positive number (1-indexed)');
    }
    if (args.limit && (typeof args.limit !== 'number' || args.limit < 1)) {
      throw new Error('Limit must be a positive number');
    }
  }

  async execute(args) {
    this.validateArgs(args);

    const api = window.electronAPI;
    if (!api || !api.fileRead) {
      return {
        success: false,
        error: 'File system API unavailable'
      };
    }

    try {
      const result = await api.fileRead(args.path, args.offset, args.limit);

      if (!result.ok) {
        return {
          success: false,
          error: result.error || 'Failed to read file'
        };
      }

      return {
        success: true,
        message: `Read ${result.lines || 0} lines from ${args.path}`,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to read file: ${error.message}`
      };
    }
  }

  formatResult(result) {
    if (!result.success) {
      return `❌ ${result.error}`;
    }

    const data = result.data;
    let output = '';

    if (data.path) {
      output += `📄 **${data.path}**\n`;
    }

    if (data.content) {
      output += '```\n';
      output += data.content;
      if (!data.content.endsWith('\n')) {
        output += '\n';
      }
      output += '```\n';
    }

    if (data.offset || data.limit) {
      const start = data.offset || 1;
      const end = data.limit ? start + data.limit - 1 : 'end';
      output += `*Lines ${start}–${end}*`;
    }

    return output.trim();
  }
}

export const fileReadTool = new FileReadTool();
