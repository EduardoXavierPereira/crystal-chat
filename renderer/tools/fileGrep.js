/**
 * File Grep Tool
 * Search file contents for patterns
 */

import { BaseTool } from './BaseTool.js';

export class FileGrepTool extends BaseTool {
  id = 'file_grep';
  name = 'Search Files';
  description = 'Search file contents using regex patterns';

  systemPrompt = `When using file_grep, format: {"title":"file_grep","arguments":{"pattern":"function\\s+\\w+","path":"/src"}}
Arguments:
- pattern: Regex pattern to search for
- path: File or directory to search in
- Optional: glob (file pattern, e.g., "*.js"), type (file type, e.g., "js", "py")
- Optional: output_mode ("content", "files_with_matches", or "count")
- Optional: head_limit (max results to return)
Examples:
- {"title":"file_grep","arguments":{"pattern":"TODO|FIXME"}} - Find TODOs
- {"title":"file_grep","arguments":{"pattern":"class\\s+\\w+","glob":"**/*.ts"}} - Find TypeScript classes
- {"title":"file_grep","arguments":{"pattern":"import.*from","type":"js","output_mode":"files_with_matches"}} - Find files with imports
Use file_grep to:
- Find specific code patterns
- Locate function definitions
- Search for error messages
- Find todos and fixmes`;

  isEnabled(state) {
    return state.toolEnabled_file_grep === true;
  }

  validateArgs(args) {
    super.validateArgs(args);
    if (!args.pattern || typeof args.pattern !== 'string') {
      throw new Error('Missing or invalid pattern argument');
    }
    if (args.glob && typeof args.glob !== 'string') {
      throw new Error('Invalid glob argument');
    }
    if (args.type && typeof args.type !== 'string') {
      throw new Error('Invalid type argument');
    }
    if (args.output_mode && !['content', 'files_with_matches', 'count'].includes(args.output_mode)) {
      throw new Error('Invalid output_mode');
    }
    if (args.head_limit && (typeof args.head_limit !== 'number' || args.head_limit < 1)) {
      throw new Error('Invalid head_limit');
    }
  }

  async execute(args) {
    this.validateArgs(args);

    const api = window.electronAPI;
    if (!api || !api.fileGrep) {
      return {
        success: false,
        error: 'File system API unavailable'
      };
    }

    try {
      const result = await api.fileGrep(args.pattern, args.path || '.', {
        glob: args.glob,
        type: args.type,
        output_mode: args.output_mode || 'content',
        head_limit: args.head_limit
      });

      if (!result.ok) {
        return {
          success: false,
          error: result.error || 'Search failed'
        };
      }

      return {
        success: true,
        message: `Found ${result.matches || 0} match(es) for pattern`,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: `Search failed: ${error.message}`
      };
    }
  }

  formatResult(result) {
    if (!result.success) {
      return `❌ ${result.error}`;
    }

    const data = result.data;
    const matches = data.matches || 0;

    if (matches === 0) {
      return 'No matches found';
    }

    let output = `**Found ${matches} match(es):**\n`;

    if (Array.isArray(data.results)) {
      for (const item of data.results.slice(0, 10)) {
        if (typeof item === 'string') {
          output += `- ${item}\n`;
        } else if (item.file && item.line) {
          output += `**${item.file}:${item.line}**\n`;
          if (item.content) {
            output += `\`\`\`\n${item.content}\n\`\`\`\n`;
          }
        }
      }

      if (data.results.length > 10) {
        output += `\n... and ${data.results.length - 10} more matches`;
      }
    }

    return output.trim();
  }
}

export const fileGrepTool = new FileGrepTool();
