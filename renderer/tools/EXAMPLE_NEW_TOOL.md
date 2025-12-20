# Example: Adding a New Tool

This is a step-by-step example of adding a new tool to Crystal Chat. We'll create a simple "calculator" tool that evaluates math expressions.

## Files to Create/Modify

### 1. Create `renderer/tools/calculator.js`

```javascript
/**
 * Calculator Tool
 * Evaluates mathematical expressions
 */

import { BaseTool } from './BaseTool.js';

export class CalculatorTool extends BaseTool {
  id = 'calculator';
  name = 'Calculator';
  description = 'Evaluate mathematical expressions';

  systemPrompt = `When using calculator, format: {"title":"calculator","arguments":{"expression":"2 + 2 * 3"}}
- Use this for math calculations and expressions
- Support for basic operators: +, -, *, /, %, ^
- Always use this tool when a calculation is needed`;

  isEnabled(state) {
    // Calculator is always enabled (doesn't depend on state)
    return true;
  }

  validateArgs(args) {
    super.validateArgs(args);
    if (!args.expression || typeof args.expression !== 'string') {
      throw new Error('Missing or invalid expression argument');
    }
    if (args.expression.length > 200) {
      throw new Error('Expression too long (max 200 characters)');
    }
  }

  async execute(args) {
    this.validateArgs(args);

    try {
      const expr = args.expression.trim();

      // Very basic safe evaluation
      // In production, use a library like math.js
      const result = this.evaluateExpression(expr);

      return {
        success: true,
        message: `${expr} = ${result}`,
        data: { expression: expr, result }
      };
    } catch (error) {
      return {
        success: false,
        error: `Calculation failed: ${error.message}`
      };
    }
  }

  evaluateExpression(expr) {
    // Simple expression evaluator
    // For production, use: import math from 'mathjs'
    // and then: return math.evaluate(expr)

    // Sanitize input
    if (!/^[0-9+\-*/(). ]+$/.test(expr)) {
      throw new Error('Invalid characters in expression');
    }

    // Use Function constructor safely (only for math)
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function('return ' + expr);
      const result = fn();
      if (!Number.isFinite(result)) {
        throw new Error('Invalid result');
      }
      return result;
    } catch {
      throw new Error('Failed to evaluate expression');
    }
  }

  formatResult(result) {
    if (!result.success) {
      return result.error || 'Calculation failed';
    }
    const data = result.data;
    return `**Calculation:** ${data.expression} = **${data.result}**`;
  }
}

export const calculatorTool = new CalculatorTool();
```

### 2. Update `renderer/tools/registry.js`

Add the import and export:

```javascript
import { calculatorTool } from './calculator.js';

const AVAILABLE_TOOLS = [
  webSearchTool,
  openLinkTool,
  calculatorTool  // Add here
];
```

### 3. Done!

The calculator tool is now:
- ✅ Registered and available
- ✅ Has a toggle in the settings
- ✅ Included in the system prompt
- ✅ Can be called by the AI

## How It Works

1. **User enables calculator** in settings
2. **Calculator toggle appears** automatically in UI
3. **System prompt includes calculator instructions** automatically
4. **AI can call it:** `{"title":"calculator","arguments":{"expression":"2+2*3"}}`
5. **Tool executes** and returns result
6. **Result shown to user** in formatted text

## Example Interaction

```
User: What is 15 * 23?