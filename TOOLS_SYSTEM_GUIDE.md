# Crystal Chat Tools System - Refactoring Guide

## Overview

The tools system has been refactored to be **modular, scalable, and extensible**. Each tool is now a self-contained module with its own logic, system prompt instructions, and UI generation. Adding new tools requires minimal changes to core code.

## Architecture

### Directory Structure

```
renderer/
├── tools/
│   ├── registry.js          # Tool registry and orchestration
│   ├── BaseTool.js          # Base class for all tools
│   ├── webSearch.js         # Web search tool implementation
│   ├── openLink.js          # Open link tool implementation
│   ├── uiGenerator.js       # Dynamic UI generation
│   └── [newTool].js         # New tools added here
├── streamingController.js   # Updated to use new tools system
├── renderer.js              # Updated to generate dynamic tool toggles
└── index.html               # Updated with dynamic tools container
```

### Core Components

#### 1. **BaseTool.js** - Base Class

All tools extend this class and must implement:

```javascript
import { BaseTool } from './BaseTool.js';

export class MyTool extends BaseTool {
  id = 'my_tool';                    // Unique identifier
  name = 'My Tool';                  // Display name
  description = 'Does something';    // Brief description

  systemPrompt = '...';              // Instructions for the AI

  isEnabled(state) {
    // Return whether this tool is enabled in the current state
    return !!state.enableMyFeature;
  }

  validateArgs(args) {
    // Validate input arguments, throw Error if invalid
    super.validateArgs(args);
    if (!args.required_param) throw new Error('Missing param');
  }

  async execute(args) {
    // Execute the tool and return:
    // { success: true/false, message: string, data?: any, error?: string }
  }

  formatResult(result) {
    // Optional: Format result for user display
    // Default implementation returns message or error
  }
}

export const myTool = new MyTool();
```

#### 2. **registry.js** - Tool Registry

Manages all tools and their orchestration:

```javascript
// Get all tools
const tools = getAvailableTools();

// Get enabled tools
const enabledTools = getEnabledTools(state);

// Get system prompt instructions for enabled tools
const prompt = getToolsSystemPrompt(state);

// Parse tool call from model output
const toolCall = parseToolCall(modelOutput);
// Returns: { title: 'tool_id', arguments: {...} } or null

// Execute a tool
const result = await executeTool('tool_id', args);

// Format tool result for display
const userText = formatToolResult('tool_id', result);
```

#### 3. **Tool Call Format**

The AI calls tools by outputting a single line of JSON:

**New Format (updated):**
```json
{"title":"web_search","arguments":{"query":"latest news"}}
{"title":"open_link","arguments":{"url":"https://example.com"}}
```

The system prompt now instructs the AI to use this format automatically.

#### 4. **System Prompt Integration**

Tool instructions are dynamically added to the system prompt based on enabled tools:

```javascript
// In streamingController.js:
const toolBlock = getToolsSystemPrompt(state);
if (toolBlock) {
  combinedSystem = `${combinedSystem}\n\n${toolBlock}`;
}
```

Each tool's `systemPrompt` is automatically included in the combined prompt.

#### 5. **UI Generation**

Tool toggles are generated dynamically in the settings:

```javascript
// In renderer.js:
generateToolToggles(containerEl, state, saveUIState, onToolToggle);
```

**No HTML changes needed for new tools** - toggles are created automatically based on available tools.

## Adding a New Tool

### Step 1: Create Tool File

Create `renderer/tools/myTool.js`:

```javascript
import { BaseTool } from './BaseTool.js';

export class MyToolName extends BaseTool {
  id = 'my_tool_id';
  name = 'My Tool Name';
  description = 'What this tool does';

  systemPrompt = `When using my_tool_id, format: {"title":"my_tool_id","arguments":{"param":"value"}}
- Brief instructions on when/how to use this tool
- Keep it practical and specific`;

  isEnabled(state) {
    // Check if tool should be enabled
    // For example: return !!state.myToolFeatureEnabled;
    return true; // or conditional based on state
  }

  validateArgs(args) {
    super.validateArgs(args);
    if (!args.requiredParam) {
      throw new Error('Missing requiredParam argument');
    }
  }

  async execute(args) {
    this.validateArgs(args);

    try {
      // Do the actual work
      const result = await doSomething(args.requiredParam);

      return {
        success: true,
        message: 'Tool completed successfully',
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: `Tool failed: ${error.message}`
      };
    }
  }

  formatResult(result) {
    if (!result.success) {
      return `Error: ${result.error}`;
    }

    // Format data for user display
    return `Result: ${result.data}`;
  }
}

export const myTool = new MyToolName();
```

### Step 2: Register Tool

Add to `renderer/tools/registry.js`:

```javascript
import { myTool } from './myTool.js';

const AVAILABLE_TOOLS = [
  webSearchTool,
  openLinkTool,
  myTool,  // Add here
];
```

### Step 3: Add State Toggle (if needed)

If your tool needs a state property, update `renderer/state.js`:

```javascript
export function createInitialState() {
  return {
    // ... existing properties ...
    myToolEnabled: false,
  };
}

export function saveUIState(state) {
  const toSave = {
    // ... existing properties ...
    myToolEnabled: !!state.myToolEnabled,
  };
  // ...
}

export function loadUIState() {
  // ... existing code ...
  if (typeof parsed.myToolEnabled === 'undefined') {
    parsed.myToolEnabled = false;
  }
  // ...
}
```

### Step 4: That's it!

The tool is now:
- ✅ Available in the registry
- ✅ Has a toggle in the UI (auto-generated)
- ✅ Included in system prompt (auto-generated)
- ✅ Can be called by the AI

## Implementation Details

### Web Search Tool

**ID:** `web_search`
**Enabled by:** `state.enableInternet`

Uses DuckDuckGo API with multiple fallback strategies:
1. Try lite.duckduckgo.com (fastest)
2. Fall back to duckduckgo.com/html (standard)
3. Fall back to DuckDuckGo Instant Answer API

Returns up to 8 results with title, snippet, and URL.

### Open Link Tool

**ID:** `open_link`
**Enabled by:** `state.enableInternet`

Fetches and extracts text from URLs:
- Strips HTML to plain text
- Supports HTTP and HTTPS
- Truncates at 12,000 characters
- Handles redirects

## Tool Execution Flow

```
User Message
    ↓
streamingController.streamAssistant()
    ↓
Build system prompt (includes tool instructions)
    ↓
Call Ollama API
    ↓
Model generates response
    ↓
parseToolCall() - Extract JSON from output
    ↓
Tool call detected? → YES:
    ↓
    executeTool(toolId, args)
    ↓
    Tool processes and returns result
    ↓
    Add result as system message
    ↓
    Call Ollama API again (max 4 times)
    ↓
    NO:
    ↓
    Render response to user
    ↓
    Save to database
    ↓
    Update memories (if enabled)
```

## System Prompt Example

When a tool is enabled, its instructions are added to the system prompt:

```
You MAY call tools if (and only if) the user enabled them in the UI.
When calling a tool, respond with ONLY a single line of JSON (no markdown, no extra text).
Tool call format:
{"title":"<tool_id>","arguments":{...}}

When using web_search, format: {"title":"web_search","arguments":{"query":"your search query"}}
- Use concise, natural search queries (2-5 words typically)
- Search for recent information, news, or facts you're unsure about
- After getting results, consider using open_link to read full articles if needed

When using open_link, format: {"title":"open_link","arguments":{"url":"https://example.com"}}
- Use this to read full articles, documentation, or specific pages
- Extract relevant information from the fetched content
- Only fetch URLs that are relevant to the user's question

After a tool result is provided, you will be called again and should either call another tool (same JSON format) or respond normally.
When you respond normally after tools, DO NOT dump raw tool JSON or a bare link list.
Instead: write a short synthesized answer.
Rules:
- Only call tools that are enabled when they're useful.
- Keep queries concise.
Enabled tools:
- web_search: Search the web for information
- open_link: Fetch and read content from a URL
```

## Key Improvements

### Scalability
- ✅ No core code changes needed for new tools
- ✅ Each tool is self-contained
- ✅ Tools don't interfere with each other

### Maintainability
- ✅ Tool logic is separated from orchestration
- ✅ Clear interface with BaseTool class
- ✅ System prompt instructions are co-located with tool code

### User Experience
- ✅ Tool toggles appear automatically
- ✅ UI stays clean (no hardcoded toggles for each tool)
- ✅ Tool instructions in system prompt are context-aware

### Developer Experience
- ✅ Simple, documented base class
- ✅ Registry handles all orchestration
- ✅ Tools can be added with minimal boilerplate

## Testing New Tools

1. **Create and register the tool** (see above)
2. **Test manually:**
   - Check that toggle appears in settings
   - Toggle it on
   - Test in a chat
   - Verify system prompt includes tool instructions

3. **Test edge cases:**
   - What happens when disabled?
   - What happens with invalid arguments?
   - What happens on network error?

## Migration Notes

### Old System
```javascript
// Old: hardcoded tool check
if (tool === 'web_search') {
  return await api.webSearch(query);
}
```

### New System
```javascript
// New: registry-based execution
return await executeTool('web_search', { query });
```

The old `enableInternet` toggle is now managed automatically based on enabled tools. Internet access is enabled if ANY internet-requiring tool is enabled.

## Future Enhancements

Potential additions to the tools system:

1. **Tool Categories** - Group related tools
2. **Tool Dependencies** - Tool A requires Tool B
3. **Tool Permissions** - Fine-grained user control
4. **Tool Metadata** - Version, author, changelog
5. **Tool Configuration** - Settings per tool (timeout, retry, etc.)
6. **Tool Analytics** - Track usage patterns
7. **Tool Composition** - Tools that call other tools

## Files Changed

- `renderer/tools/registry.js` - **NEW** - Tool registry
- `renderer/tools/BaseTool.js` - **NEW** - Base class
- `renderer/tools/webSearch.js` - **NEW** - Web search tool
- `renderer/tools/openLink.js` - **NEW** - Open link tool
- `renderer/tools/uiGenerator.js` - **NEW** - UI generation
- `renderer/streamingController.js` - **UPDATED** - Use registry
- `renderer/renderer.js` - **UPDATED** - Dynamic toggles
- `renderer/sidebar.js` - **UPDATED** - New element reference
- `renderer/index.html` - **UPDATED** - Dynamic tools container
- `renderer/state.js` - **UNCHANGED** - Still uses enableInternet

## Backward Compatibility

The refactored system maintains full backward compatibility:
- Same tool call results returned to the model
- Same `enableInternet` state property
- Same UI behavior for existing tools
- No changes to tool result format in thinking blocks
