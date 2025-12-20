/**
 * Web Search Tool
 * Searches the web using DuckDuckGo API
 */

import { BaseTool } from './BaseTool.js';

export class WebSearchTool extends BaseTool {
  id = 'web_search';
  name = 'Web Search';
  description = 'Search the web for information';

  systemPrompt = `When using web_search, format: {"title":"web_search","arguments":{"query":"your search query"}}
- Use concise, natural search queries (2-5 words typically)
- Search for recent information, news, or facts you're unsure about
- After getting results, consider using open_link to read full articles if needed`;

  isEnabled(state) {
    return !!state.enableInternet;
  }

  validateArgs(args) {
    super.validateArgs(args);
    if (!args.query || typeof args.query !== 'string') {
      throw new Error('Missing or invalid query argument');
    }
  }

  async execute(args) {
    this.validateArgs(args);

    const api = window.electronAPI;
    if (!api || !api.webSearch) {
      return {
        success: false,
        error: 'Web search API unavailable'
      };
    }

    try {
      const result = await api.webSearch(args.query);

      if (!result.ok) {
        return {
          success: false,
          error: `Search failed: ${result.error || 'Unknown error'}`
        };
      }

      return {
        success: true,
        message: `Found ${result.results.length} results for "${args.query}"`,
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
      return result.error || 'Search failed';
    }

    const data = result.data;
    if (!data || !data.results || data.results.length === 0) {
      return 'No search results found';
    }

    let output = '';

    if (data.abstract) {
      output += `**Summary:** ${data.abstract.slice(0, 300)}\n\n`;
    }

    output += '**Results:**\n';
    for (let i = 0; i < Math.min(5, data.results.length); i++) {
      const r = data.results[i];
      output += `${i + 1}. **${r.title || 'Untitled'}**\n`;
      if (r.snippet) {
        output += `   ${r.snippet.slice(0, 200)}\n`;
      }
      if (r.url) {
        output += `   ${r.url}\n`;
      }
    }

    return output.trim();
  }
}

export const webSearchTool = new WebSearchTool();
