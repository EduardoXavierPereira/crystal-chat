/**
 * Folder Browse Tool
 * List directory contents
 */

import { BaseTool } from './BaseTool.js';

export class FolderBrowseTool extends BaseTool {
  id = 'folder_browse';
  name = 'List Folder';
  description = 'List directory contents and structure';

  systemPrompt = `When using folder_browse, format: {"title":"folder_browse","arguments":{"path":"/absolute/path"}}
Arguments:
- path: Directory path to list
- Optional: recursive=true for recursive listing (shows subdirectories)
Examples:
- {"title":"folder_browse","arguments":{"path":"/home/user/project"}} - List directory
- {"title":"folder_browse","arguments":{"path":"/src","recursive":true}} - Recursive listing
Use folder_browse to:
- Explore project structure
- Find directories and files
- Understand folder organization`;

  isEnabled(state) {
    return state.toolEnabled_folder_browse === true;
  }

  validateArgs(args) {
    super.validateArgs(args);
    if (!args.path || typeof args.path !== 'string') {
      throw new Error('Missing or invalid path argument');
    }
    if (!args.path.startsWith('/')) {
      throw new Error('Path must be absolute (start with /)');
    }
  }

  async execute(args) {
    this.validateArgs(args);

    const api = window.electronAPI;
    if (!api || !api.folderBrowse) {
      return {
        success: false,
        error: 'File system API unavailable'
      };
    }

    try {
      const result = await api.folderBrowse(args.path, args.recursive);

      if (!result.ok) {
        return {
          success: false,
          error: result.error || 'Failed to browse folder'
        };
      }

      return {
        success: true,
        message: `Listed ${result.items?.length || 0} item(s) in ${args.path}`,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to browse folder: ${error.message}`
      };
    }
  }

  formatResult(result) {
    if (!result.success) {
      return `❌ ${result.error}`;
    }

    const items = result.data?.items || [];

    if (items.length === 0) {
      return `**${result.data?.path}/** is empty`;
    }

    let output = `**${result.data?.path}/**\n`;
    output += '```\n';

    for (const item of items.slice(0, 50)) {
      const prefix = item.type === 'dir' ? '📁 ' : '📄 ';
      output += `${prefix}${item.name}${item.type === 'dir' ? '/' : ''}\n`;
    }

    if (items.length > 50) {
      output += `\n... and ${items.length - 50} more items\n`;
    }

    output += '```';

    return output.trim();
  }
}

export const folderBrowseTool = new FolderBrowseTool();
