/**
 * File Edit Tool
 * Replace exact string in file (partial editing)
 */

import { BaseTool } from './BaseTool.js';

export class FileEditTool extends BaseTool {
  id = 'file_edit';
  name = 'Edit File';
  description = 'Replace exact string in file (partial edits)';

  systemPrompt = `When using file_edit, format: {"title":"file_edit","arguments":{"path":"/path/file.js","old_string":"old content","new_string":"new content"}}
Important: old_string must match EXACTLY (whitespace, indentation, everything)
- old_string: The exact text to find and replace
- new_string: The replacement text
- Optional: replace_all=true to replace all occurrences (default: first match only)
Use file_edit for:
- Changing specific functions or sections
- Fixing bugs
- Adding comments or lines
Tip: Include surrounding context to make old_string unique`;

  isEnabled(state) {
    return state.toolEnabled_file_edit === true;
  }

  validateArgs(args) {
    super.validateArgs(args);
    if (!args.path || typeof args.path !== 'string') {
      throw new Error('Missing or invalid path argument');
    }
    if (!args.path.startsWith('/')) {
      throw new Error('Path must be absolute (start with /)');
    }
    if (typeof args.old_string !== 'string') {
      throw new Error('Missing or invalid old_string argument');
    }
    if (typeof args.new_string !== 'string') {
      throw new Error('Missing or invalid new_string argument');
    }
    if (args.old_string === args.new_string) {
      throw new Error('old_string and new_string are identical');
    }
  }

  async execute(args) {
    this.validateArgs(args);

    const api = window.electronAPI;
    if (!api || !api.fileEdit) {
      return {
        success: false,
        error: 'File system API unavailable'
      };
    }

    try {
      const result = await api.fileEdit(
        args.path,
        args.old_string,
        args.new_string,
        args.replace_all
      );

      if (!result.ok) {
        return {
          success: false,
          error: result.error || 'Failed to edit file'
        };
      }

      return {
        success: true,
        message: `Replaced ${result.replacements || 0} occurrence(s) in ${args.path}`,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to edit file: ${error.message}`
      };
    }
  }

  formatResult(result) {
    if (!result.success) {
      return `❌ ${result.error}`;
    }

    const data = result.data;
    const count = data.replacements || 0;
    const msg = count === 1 ? '1 replacement' : `${count} replacements`;
    return `✅ Made ${msg} in ${data.path || 'file'}`;
  }
}

export const fileEditTool = new FileEditTool();
