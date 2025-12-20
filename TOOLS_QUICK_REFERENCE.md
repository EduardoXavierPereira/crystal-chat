# Tools System - Quick Reference

## Adding a New Tool - 3 Simple Steps

### Step 1: Create `renderer/tools/myTool.js`

```javascript
import { BaseTool } from './BaseTool.js';

export class MyTool extends BaseTool {
  id = 'my_tool';                              // Unique ID
  name = 'My Tool';                            // Display name
  description = 'What it does';                // Tooltip/description

  systemPrompt = `Instructions for the AI
- Keep it practical
- Explain when to use`;

  isEnabled(state) {
    return true;  // or conditional based on state
  }

  async execute(args) {
    // Validate input
    if (!args.required) throw new Error('Missing argument');

    try {
      // Do work
      const result = await doWork(args);

      return {
        success: true,
        message: 'Success message',
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: `Error: ${error.message}`
      };
    }
  }

  formatResult(result) {
    // Optional: Format for user display
    if (!result.success) return result.error;
    return `Result: ${result.data}`;
  }
}

export const myTool = new MyTool();
```

### Step 2: Register in `renderer/tools/registry.js`

```javascript
import { myTool } from './myTool.js';

const AVAILABLE_TOOLS = [
  webSearchTool,
  openLinkTool,
  myTool  // ← Add here
];
```

### Step 3: Done! ✅

Your tool automatically gets:
- UI toggle in settings
- System prompt instructions
- Full AI integration

## File Organization

```
renderer/
├── tools/
│   ├── registry.js         ← Orchestration hub
│   ├── BaseTool.js         ← Base class (extend this)
│   ├── webSearch.js        ← Example tool
│   ├── openLink.js         ← Example tool
│   ├── uiGenerator.js      ← Dynamic UI
│   └── [yourTool].js       ← Add new tools here
├── streamingController.js  ← Uses registry
└── renderer.js             ← Generates UI
```

## Key APIs

### In Your Tool

```javascript
// Tool base class
import { BaseTool } from './BaseTool.js';

class MyTool extends BaseTool {
  id = 'tool_id';
  name = 'Tool Name';
  description = 'What it does';
  systemPrompt = 'AI instructions';

  isEnabled(state) → boolean
  validateArgs(args) → void (throws if invalid)
  async execute(args) → { success, message, data?, error? }
  formatResult(result) → string
}
```

### In Other Code

```javascript
import {
  getAvailableTools,
  getEnabledTools,
  getTool,
  getToolsSystemPrompt,
  parseToolCall,
  executeTool,
  formatToolResult
} from './tools/registry.js';

// Get tools
getAvailableTools()                    // All tools
getEnabledTools(state)                 // Only enabled
getTool('tool_id')                     // Specific tool

// AI interaction
getToolsSystemPrompt(state)            // Add to system prompt
parseToolCall(modelOutput)             // Parse: {"title":"...","arguments":{...}}
await executeTool('tool_id', args)     // Run tool
formatToolResult('tool_id', result)    // Format for user
```

## Tool Return Format

```javascript
// Success
{
  success: true,
  message: 'Summary message',
  data: { /* tool-specific data */ }
}

// Error
{
  success: false,
  error: 'Error description'
}
```

## System Prompt Format

The AI calls tools by outputting JSON:

```json
{"title":"my_tool","arguments":{"param":"value"}}
```

Only one JSON object per response. The system prompt automatically includes:
- Tool descriptions
- Specific tool instructions
- Rules for tool usage
- Enabled tools list

## State Integration

If your tool depends on state:

1. **Add to `state.js`:**
   ```javascript
   export function createInitialState() {
     return {
       myToolEnabled: false,
       // ... other state
     };
   }
   ```

2. **Check in `isEnabled()`:**
   ```javascript
   isEnabled(state) {
     return state.myToolEnabled;
   }
   ```

3. **UI toggle created automatically!**

## Examples

### Simple Tool (No Dependencies)

```javascript
export class HelloTool extends BaseTool {
  id = 'hello';
  name = 'Hello';
  description = 'Greeting tool';
  systemPrompt = 'Say hello when asked';

  async execute(args) {
    const name = args.name || 'World';
    return {
      success: true,
      message: `Hello, ${name}!`,
      data: { greeting: `Hello, ${name}!` }
    };
  }
}
```

### API Tool (With State)

```javascript
export class MyAPITool extends BaseTool {
  id = 'myapi';
  name = 'My API';
  description = 'Fetch from my API';
  systemPrompt = 'Use when user asks about API data';

  isEnabled(state) {
    return state.apiKeyConfigured;
  }

  async execute(args) {
    const url = args.url || 'https://api.example.com/data';
    const res = await fetch(url);
    const data = await res.json();

    return {
      success: true,
      message: `Fetched ${data.items?.length || 0} items`,
      data
    };
  }

  formatResult(result) {
    if (!result.success) return result.error;
    const count = result.data.items?.length || 0;
    return `Found ${count} results`;
  }
}
```

## Testing

### Manual Test

1. Create and register your tool
2. Restart the app
3. Check settings for new toggle
4. Toggle it on
5. Test in a chat
6. Check thinking block for instructions

### Automated Test (Example)

```javascript
import { executeTool } from './tools/registry.js';

const result = await executeTool('my_tool', {
  param: 'test_value'
});

if (result.success) {
  console.log('Tool works!', result.data);
} else {
  console.error('Tool failed:', result.error);
}
```

## Common Patterns

### Input Validation

```javascript
validateArgs(args) {
  super.validateArgs(args);

  if (!args.url) throw new Error('Missing url');
  if (typeof args.url !== 'string') throw new Error('Invalid url');
  if (args.url.length > 2000) throw new Error('URL too long');
}
```

### Error Handling

```javascript
async execute(args) {
  this.validateArgs(args);

  try {
    const result = await riskyOperation(args);
    return {
      success: true,
      message: `Operation succeeded`,
      data: result
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed: ${error.message}`
    };
  }
}
```

### Formatting Results

```javascript
formatResult(result) {
  if (!result.success) {
    return `❌ ${result.error}`;
  }

  const { data } = result;
  let output = '';

  if (data.items?.length) {
    output += `Found ${data.items.length} results:\n`;
    for (const item of data.items.slice(0, 5)) {
      output += `- ${item.name}\n`;
    }
  }

  return output || 'No results';
}
```

## Debugging

### Check Tool is Registered

```javascript
import { getAvailableTools, getTool } from './tools/registry.js';

console.log(getAvailableTools());  // List all
console.log(getTool('my_tool'));   // Check specific
```

### Check Tool is Enabled

```javascript
import { getEnabledTools } from './tools/registry.js';

console.log(getEnabledTools(state));  // Show enabled
```

### Check System Prompt

```javascript
import { getToolsSystemPrompt } from './tools/registry.js';

console.log(getToolsSystemPrompt(state));  // See prompt
```

## FAQ

**Q: Do I need to create a UI toggle?**
A: No! It's created automatically for you.

**Q: Can I make a tool dependent on state?**
A: Yes! Use `isEnabled()` to check state and create the state property.

**Q: What if my tool fails?**
A: Return `{ success: false, error: '...' }` and the system handles it.

**Q: How many tools can I add?**
A: Unlimited! The system scales automatically.

**Q: Do I need to modify core files?**
A: Only register in `registry.js`. That's it!

**Q: Can tools call other tools?**
A: Currently they call the API directly. Future enhancement planned.

## Related Files

- **Implementation guide:** `TOOLS_SYSTEM_GUIDE.md` (350+ lines)
- **Example tool:** `renderer/tools/EXAMPLE_NEW_TOOL.md`
- **System summary:** `REFACTORING_SUMMARY.md`

---

**That's it!** You can now add tools to Crystal Chat. Happy coding! 🚀
