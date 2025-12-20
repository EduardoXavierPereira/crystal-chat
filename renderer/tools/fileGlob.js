/**
 * File Glob Tool
 * Find files matching a glob pattern
 */

import { BaseTool } from './BaseTool.js';

export class FileGlobTool extends BaseTool {
  id = 'file_glob';
  name = 'Find Files';
  description = 'Find files matching a glob pattern';

  systemPrompt = `When using file_glob, format: {"title":"file_glob","arguments":{"pattern":"**/*.js","path":"/project"}}
Arguments:
- pattern: Glob pattern to match (e.g., "**/*.js", "src/**/*.ts", "*.md")
- path: Optional root directory (defaults to current working directory)
Examples:
- {"title":"file_glob","arguments":{"pattern":"**/*.js"}} - Find all JS files
- {"title":"file_glob","arguments":{"pattern":"src/components/**/*.tsx"}} - Find React components
- {"title":"file_glob","arguments":{"pattern":"*.md","path":"/docs"}} - Find markdown in /docs
Use file_glob to:
- Locate files by pattern or name
- Find all files of a type
- Discover implementation files`;

  isEnabled(state) {
    return state.toolEnabled_file_glob === true;
  }

  validateArgs(args) {
    super.validateArgs(args);
    if (!args.pattern || typeof args.pattern !== 'string') {
      throw new Error('Missing or invalid pattern argument');
    }
    if (args.path && typeof args.path !== 'string') {
      throw new Error('Invalid path argument');
    }
  }

  async execute(args) {
    this.validateArgs(args);

    const api = window.electronAPI;
    if (!api || !api.fileGlob) {
      return {
        success: false,
        error: 'File system API unavailable'
      };
    }

    try {
      const result = await api.fileGlob(args.pattern, args.path);

      if (!result.ok) {
        return {
          success: false,
          error: result.error || 'Failed to search files'
        };
      }

      return {
        success: true,
        message: `Found ${result.files?.length || 0} file(s) matching "${args.pattern}"`,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to search files: ${error.message}`
      };
    }
  }

  formatResult(result) {
    if (!result.success) {
      return `❌ ${result.error}`;
    }

    const files = result.data?.files || [];

    if (files.length === 0) {
      return 'No files found matching the pattern';
    }

    let output = `**Found ${files.length} file(s):**\n`;

    for (const file of files.slice(0, 20)) {
      output += `- ${file}\n`;
    }

    if (files.length > 20) {
      output += `\n... and ${files.length - 20} more`;
    }

    return output.trim();
  }
}

export const fileGlobTool = new FileGlobTool();
