/**
 * Open Link Tool
 * Fetches and extracts text content from URLs
 */

import { BaseTool } from './BaseTool.js';

export class OpenLinkTool extends BaseTool {
  id = 'open_link';
  name = 'Open Link';
  description = 'Fetch and read content from a URL';

  systemPrompt = `When using open_link, format: {"title":"open_link","arguments":{"url":"https://example.com"}}
- Use this to read full articles, documentation, or specific pages
- Extract relevant information from the fetched content
- Only fetch URLs that are relevant to the user's question`;

  isEnabled(state) {
    return state.toolEnabled_open_link === true;
  }

  validateArgs(args) {
    super.validateArgs(args);
    if (!args.url || typeof args.url !== 'string') {
      throw new Error('Missing or invalid url argument');
    }

    // Basic URL validation
    try {
      new URL(args.url);
    } catch {
      throw new Error('Invalid URL format');
    }
  }

  async execute(args) {
    this.validateArgs(args);

    const api = window.electronAPI;
    if (!api || !api.openLink) {
      return {
        success: false,
        error: 'Link opening API unavailable'
      };
    }

    try {
      const result = await api.openLink(args.url);

      if (!result.ok) {
        return {
          success: false,
          error: `Failed to fetch URL: ${result.error || 'Unknown error'}`
        };
      }

      return {
        success: true,
        message: `Successfully fetched content from ${new URL(args.url).hostname}`,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to fetch URL: ${error.message}`
      };
    }
  }

  formatResult(result) {
    if (!result.success) {
      return result.error || 'Failed to fetch URL';
    }

    const data = result.data;
    if (!data || !data.text) {
      return 'No content found at URL';
    }

    let output = '';

    try {
      const url = new URL(data.url);
      output += `**Source:** ${url.hostname}\n`;
    } catch {
      output += `**Source:** ${data.url}\n`;
    }

    if (data.truncated) {
      output += `*Note: Content truncated (${data.bytes || '?'} / ${data.maxBytes || '?'} bytes)*\n`;
    }

    output += '\n';
    output += data.text.slice(0, 4000);

    if (data.text.length > 4000) {
      output += '\n\n*...content truncated*';
    }

    return output.trim();
  }
}

export const openLinkTool = new OpenLinkTool();
