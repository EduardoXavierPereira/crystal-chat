# File System Tools Guide

## Overview

Crystal Chat now includes a complete file system toolkit that lets you edit code, search files, and manage your project entirely within the chat interface. These tools work **locally without requiring internet access** and mirror the Claude Code workflow you're used to.

## Available Tools

### 1. **file_read** - Read File Contents

Read any file with optional line range selection.

```json
{"title":"file_read","arguments":{"path":"/path/to/file.js"}}
{"title":"file_read","arguments":{"path":"/path/to/file.js","offset":10,"limit":20}}
```

**Arguments:**
- `path` (required): Absolute file path
- `offset` (optional): Starting line number (1-indexed, default: 1)
- `limit` (optional): Number of lines to read (default: entire file)

**Returns:**
```javascript
{
  ok: true,
  path: "/path/to/file.js",
  content: "file contents...",
  lines: 42,
  offset: 10,
  limit: 20
}
```

**Use cases:**
- Examine code to understand implementation
- Check configuration files
- Review specific sections of large files
- View error stack traces or logs

---

### 2. **file_write** - Write/Create Files

Create new files or completely overwrite existing ones.

```json
{"title":"file_write","arguments":{"path":"/path/to/newfile.js","content":"console.log('hello');"}}
```

**Arguments:**
- `path` (required): Absolute file path
- `content` (required): File contents as string

**Returns:**
```javascript
{
  ok: true,
  path: "/path/to/newfile.js",
  bytes: 27
}
```

**Use cases:**
- Create new code files
- Write documentation
- Generate configuration files
- Save templates

**⚠️ Warning:** Overwrites entire file. Use `file_edit` for partial changes.

---

### 3. **file_edit** - Replace Text in File

Replace exact strings in files for surgical edits.

```json
{"title":"file_edit","arguments":{"path":"/path/to/file.js","old_string":"const x = 5;","new_string":"const x = 10;"}}
{"title":"file_edit","arguments":{"path":"/path/to/file.js","old_string":"old text","new_string":"new text","replace_all":true}}
```

**Arguments:**
- `path` (required): Absolute file path
- `old_string` (required): Exact text to find (must match perfectly, including whitespace)
- `new_string` (required): Replacement text
- `replace_all` (optional): Replace all occurrences instead of just first (default: false)

**Returns:**
```javascript
{
  ok: true,
  path: "/path/to/file.js",
  replacements: 1
}
```

**Use cases:**
- Fix bugs in specific functions
- Update variable names
- Add/remove features
- Fix indentation issues
- Update imports

**💡 Tips:**
- Include surrounding context to make `old_string` unique
- When matching code, preserve exact indentation and spacing
- For complex changes, use multiple `file_edit` calls

---

### 4. **file_glob** - Find Files by Pattern

Search for files matching glob patterns.

```json
{"title":"file_glob","arguments":{"pattern":"**/*.js"}}
{"title":"file_glob","arguments":{"pattern":"src/**/*.tsx","path":"/home/user/project"}}
{"title":"file_glob","arguments":{"pattern":"*.md","path":"/docs"}}
```

**Arguments:**
- `pattern` (required): Glob pattern (e.g., `**/*.js`, `src/components/**/*.tsx`, `*.md`)
- `path` (optional): Search root directory (default: current working directory)

**Returns:**
```javascript
{
  ok: true,
  pattern: "**/*.js",
  path: "/home/user/project",
  files: [
    "src/index.js",
    "src/utils.js",
    "test/test.js",
    // ... up to 100 results
  ]
}
```

**Glob Pattern Examples:**
- `*.js` - All JS files in current directory
- `**/*.js` - All JS files recursively
- `src/**/*.tsx` - All React components in src
- `**/*test*` - All files with "test" in name
- `{src,lib}/**/*.js` - Files in src or lib directories

**Use cases:**
- Locate files by type or pattern
- Find all components in a project
- Discover test files
- Find configuration files

---

### 5. **file_grep** - Search File Contents

Search file contents using regex patterns.

```json
{"title":"file_grep","arguments":{"pattern":"function\\s+\\w+","path":"/src"}}
{"title":"file_grep","arguments":{"pattern":"TODO|FIXME","glob":"**/*.js"}}
{"title":"file_grep","arguments":{"pattern":"export\\s+class","type":"ts","output_mode":"files_with_matches"}}
```

**Arguments:**
- `pattern` (required): Regex pattern to search for
- `path` (optional): Directory to search (default: current directory)
- `glob` (optional): File glob pattern (default: `**/*`)
- `type` (optional): File type filter (e.g., `js`, `ts`, `py`, `md`)
- `output_mode` (optional): `content` (default), `files_with_matches`, or `count`
- `head_limit` (optional): Max results to return

**Returns:**
```javascript
{
  ok: true,
  pattern: "TODO|FIXME",
  matches: 42,
  results: [
    {
      file: "/src/index.js",
      line: 10,
      content: "// TODO: refactor this function"
    },
    // ... more results
  ]
}
```

**Common Patterns:**
- `TODO|FIXME|HACK` - Find work items
- `function\\s+\\w+` - Find function definitions
- `class\\s+\\w+` - Find class definitions
- `import.*from` - Find imports
- `export\\s+(default|const|function|class)` - Find exports
- `\\bvar\\s+\\w+` - Find old var declarations
- `console\\.log` - Find debug statements

**Use cases:**
- Find TODOs and FIXMEs
- Locate specific functions or classes
- Find all imports/exports
- Search for error handling
- Find debug statements to remove
- Locate configuration patterns

---

### 6. **folder_browse** - List Directory Contents

Explore directory structure.

```json
{"title":"folder_browse","arguments":{"path":"/home/user/project"}}
{"title":"folder_browse","arguments":{"path":"/src","recursive":true}}
```

**Arguments:**
- `path` (required): Absolute directory path
- `recursive` (optional): Include subdirectories up to 3 levels deep

**Returns:**
```javascript
{
  ok: true,
  path: "/home/user/project",
  items: [
    { name: "src", type: "dir", path: "/home/user/project/src" },
    { name: "package.json", type: "file", path: "/home/user/project/package.json" },
    // ... up to 100 items
  ],
  count: 15
}
```

**Use cases:**
- Understand project structure
- Find specific directories
- Explore source code layout
- Navigate project

---

## Workflow Examples

### Example 1: Fix a Bug

```
1. Search for the bug location:
   {"title":"file_grep","arguments":{"pattern":"calculateTotal","glob":"**/*.js"}}

2. Read the file:
   {"title":"file_read","arguments":{"path":"/src/math.js","offset":45,"limit":15}}

3. Fix the bug:
   {"title":"file_edit","arguments":{"path":"/src/math.js","old_string":"return x + y;","new_string":"return x * y;"}}

4. Verify the fix:
   {"title":"file_read","arguments":{"path":"/src/math.js","offset":45,"limit":15}}
```

### Example 2: Add a New Feature

```
1. Find where to add the feature:
   {"title":"file_glob","arguments":{"pattern":"src/**/*.js"}}

2. Read the target file:
   {"title":"file_read","arguments":{"path":"/src/features.js"}}

3. Add the new feature:
   {"title":"file_edit","arguments":{"path":"/src/features.js","old_string":"export const features = [];","new_string":"export const features = [\n  'newFeature'\n];"}}

4. Create a test file:
   {"title":"file_write","arguments":{"path":"/test/newFeature.test.js","content":"test('newFeature', () => { ... });"}}
```

### Example 3: Refactor Code

```
1. Find all references:
   {"title":"file_grep","arguments":{"pattern":"oldFunctionName","glob":"**/*.js"}}

2. Update each file:
   {"title":"file_read","arguments":{"path":"/src/module1.js"}}
   {"title":"file_edit","arguments":{"path":"/src/module1.js","old_string":"oldFunctionName()","new_string":"newFunctionName()"}}

3. Repeat for other files
```

---

## How These Compare to Claude Code

| Task | Claude Code | Crystal Chat |
|------|------------|--------------|
| Read file | `/read src/file.js` | `file_read` tool |
| Read with range | `/read src/file.js:10-20` | `file_read` with offset/limit |
| Search files | `/grep pattern` | `file_grep` tool |
| Find files | `/glob **/*.js` | `file_glob` tool |
| Edit file | `/edit` then exact replace | `file_edit` tool |
| Browse folder | `/ls src/` | `folder_browse` tool |
| Create file | `/write` then content | `file_write` tool |

The main difference: Crystal Chat requires explicit tool calls with JSON arguments, while Claude Code has shorthand slash commands. But the functionality is **identical** and works **entirely locally**.

---

## Best Practices

### ✅ DO

- Use `file_read` with `offset` and `limit` for large files
- Include surrounding context in `old_string` to ensure uniqueness
- Use `file_glob` to discover files before reading
- Use `file_grep` to locate code before editing
- Make multiple small edits rather than one massive edit

### ❌ DON'T

- Use `file_write` for large code changes (breaks easily on updates)
- Make `old_string` too generic (won't match uniquely)
- Ignore indentation when editing (exact match required)
- Read entire multi-MB files at once
- Search without specifying `glob` pattern (slow on large projects)

---

## Common Patterns

### Find and Replace Multiple Files

```json
{"title":"file_grep","arguments":{"pattern":"oldName","output_mode":"files_with_matches","glob":"**/*.js"}}
```
Then call `file_edit` on each returned file.

### Find TODOs in Project

```json
{"title":"file_grep","arguments":{"pattern":"TODO|FIXME","glob":"**/*.{js,ts,jsx,tsx}","head_limit":20}}
```

### Find All Tests

```json
{"title":"file_glob","arguments":{"pattern":"**/*.test.{js,ts}"}}
```

### Explore Project Structure

```json
{"title":"folder_browse","arguments":{"path":"/home/user/project","recursive":true}}
```

### Read Specific Line Range

```json
{"title":"file_read","arguments":{"path":"/src/app.js","offset":100,"limit":50}}
```

---

## Error Handling

All tools return standardized error responses:

```javascript
{
  ok: false,
  error: "error_code_or_message"
}
```

Common errors:
- `missing_path` - No path provided
- `path_not_found` - File/directory doesn't exist
- `not_a_directory` - Path is file but directory expected
- `read_failed` - Cannot read file (permissions, encoding, etc.)
- `missing_old_string` - String not found in file (for file_edit)
- `invalid_regex` - Invalid regex pattern (for file_grep)

---

## Performance Notes

- `file_read` is fast even for large files (limits available)
- `file_glob` patterns are case-sensitive on Linux/Mac, insensitive on Windows
- `file_grep` searches up to 100 files (configurable)
- `folder_browse` shows up to 100 items (first level) or 100 total (recursive)
- All operations are synchronous for simplicity

---

## Integration with Tools System

These tools integrate seamlessly with Crystal Chat's tools system:

1. **Always available** - No toggles needed, all tools are enabled
2. **Consistent API** - Uses same `title`/`arguments` format
3. **Error handling** - Returns `success` boolean and `data`
4. **System prompt** - AI understands how to use each tool
5. **Results formatting** - Human-readable output in chat

---

## Examples in Practice

Ask your AI assistant things like:

- "Find all TODO comments in my project"
- "Show me the calculateTotal function"
- "Replace all 'var ' with 'const ' in the src directory"
- "What files are in the components folder?"
- "Find all files that export a class"
- "Create a new test file with this content"
- "Show me lines 50-100 of main.js"

The AI will use the file system tools to answer your questions and make changes for you.
