const fs = require('fs');
const path = require('path');

/**
 * File system tools for the main process.
 * Provides file operations accessible via IPC.
 */

/**
 * Simple glob pattern matcher (basic support for *, **, and ?)
 * @param {string} filePath - File path to test
 * @param {string} pattern - Glob pattern
 * @returns {boolean}
 */
function matchesGlobPattern(filePath, pattern) {
  let regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

/**
 * Recursively find files matching a pattern
 * @param {string} startPath - Starting directory
 * @param {string} pattern - Glob pattern
 * @param {number} maxResults - Maximum results to return
 * @returns {Array<string>} Array of file paths
 */
function findFiles(startPath, pattern, maxResults = 100) {
  const results = [];

  function traverse(dir) {
    if (results.length >= maxResults) return;

    try {
      const entries = fs.readdirSync(dir);

      for (const entry of entries) {
        if (results.length >= maxResults) break;

        // Skip hidden files and common exclusions
        if (entry.startsWith('.')) continue;
        if (entry === 'node_modules') continue;

        const fullPath = path.join(dir, entry);
        const relPath = path.relative(startPath, fullPath);

        try {
          const stat = fs.statSync(fullPath);

          if (stat.isFile()) {
            if (matchesGlobPattern(relPath, pattern)) {
              results.push(fullPath);
            }
          } else if (stat.isDirectory()) {
            traverse(fullPath);
          }
        } catch {
          // Skip files we can't stat
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  traverse(startPath);
  return results;
}

/**
 * Escape regex special characters
 * @param {string} string - String to escape
 * @returns {string}
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Read a file with optional line offset and limit
 * @param {string} filePath - Path to file
 * @param {number} offset - Line offset (1-indexed)
 * @param {number} limit - Maximum lines to read
 * @returns {object} Result object
 */
function fileRead(filePath, offset, limit) {
  const p = (filePath || '').toString().trim();
  if (!p) return { ok: false, error: 'missing_path' };

  try {
    const content = fs.readFileSync(p, 'utf8');
    const lines = content.split('\n');

    const startLine = (offset || 1) - 1;
    const maxLines = limit || lines.length - startLine;
    const endLine = Math.min(startLine + maxLines, lines.length);

    const selectedLines = lines.slice(startLine, endLine);
    const result = selectedLines.join('\n');

    return {
      ok: true,
      path: p,
      content: result,
      lines: selectedLines.length,
      offset,
      limit
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Write content to a file
 * @param {string} filePath - Path to file
 * @param {string} content - Content to write
 * @returns {object} Result object
 */
function fileWrite(filePath, content) {
  const p = (filePath || '').toString().trim();
  if (!p) return { ok: false, error: 'missing_path' };
  if (typeof content !== 'string') return { ok: false, error: 'missing_content' };

  try {
    fs.writeFileSync(p, content, 'utf8');
    return {
      ok: true,
      path: p,
      bytes: content.length
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Edit a file by replacing strings
 * @param {string} filePath - Path to file
 * @param {string} oldString - String to replace
 * @param {string} newString - Replacement string
 * @param {boolean} replaceAll - Replace all occurrences
 * @returns {object} Result object
 */
function fileEdit(filePath, oldString, newString, replaceAll) {
  const p = (filePath || '').toString().trim();
  if (!p) return { ok: false, error: 'missing_path' };
  if (typeof oldString !== 'string') return { ok: false, error: 'missing_old_string' };
  if (typeof newString !== 'string') return { ok: false, error: 'missing_new_string' };

  try {
    let content = fs.readFileSync(p, 'utf8');
    let replacements = 0;

    if (replaceAll) {
      const regex = new RegExp(escapeRegExp(oldString), 'g');
      const newContent = content.replace(regex, newString);
      replacements = (content.match(regex) || []).length;
      content = newContent;
    } else {
      if (content.includes(oldString)) {
        content = content.replace(oldString, newString);
        replacements = 1;
      }
    }

    fs.writeFileSync(p, content, 'utf8');

    return {
      ok: true,
      path: p,
      replacements
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Find files matching a glob pattern
 * @param {string} pattern - Glob pattern
 * @param {string} basePath - Base path to search from
 * @returns {object} Result object
 */
function fileGlob(pattern, basePath) {
  const pat = (pattern || '').toString().trim();
  if (!pat) return { ok: false, error: 'missing_pattern' };

  const searchPath = basePath ? (basePath || '').toString().trim() : process.cwd();

  try {
    if (!fs.existsSync(searchPath)) {
      return { ok: false, error: 'path_not_found' };
    }

    const files = findFiles(searchPath, pat, 100);
    return {
      ok: true,
      pattern: pat,
      path: searchPath,
      files
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Search files for a pattern using regex
 * @param {string} pattern - Regex pattern
 * @param {string} searchPath - Path to search
 * @param {string} globPattern - Glob pattern for files
 * @param {string} type - File type filter (unused in simple implementation)
 * @param {string} outputMode - Output mode (files_with_matches, count, or content)
 * @param {number} headLimit - Maximum results
 * @returns {object} Result object
 */
function fileGrep(pattern, searchPath, globPattern, type, outputMode, headLimit) {
  const pat = (pattern || '').toString().trim();
  if (!pat) return { ok: false, error: 'missing_pattern' };

  const sp = (searchPath || '.').toString().trim();

  try {
    const regex = new RegExp(pat);
    const results = [];
    let matches = 0;

    const globPattern_ = globPattern || '**/*';
    const files = findFiles(sp, globPattern_, 100);

    for (const fullPath of files) {
      if (headLimit && results.length >= headLimit) break;

      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');

        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i])) {
            matches += 1;
            if (outputMode === 'files_with_matches') {
              if (!results.find(r => r === fullPath)) {
                results.push(fullPath);
              }
            } else if (outputMode === 'count') {
              // Already counting
            } else {
              results.push({
                file: fullPath,
                line: i + 1,
                content: lines[i]
              });
            }

            if (headLimit && results.length >= headLimit) break;
          }
        }
      } catch {
        // Skip files that can't be read
      }
    }

    return {
      ok: true,
      pattern: pat,
      matches,
      results: results.slice(0, headLimit || 50)
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Browse a folder's contents
 * @param {string} folderPath - Path to folder
 * @param {boolean} recursive - Whether to recurse into subdirectories
 * @returns {object} Result object
 */
function folderBrowse(folderPath, recursive) {
  const p = (folderPath || '').toString().trim();
  if (!p) return { ok: false, error: 'missing_path' };

  try {
    if (!fs.existsSync(p)) {
      return { ok: false, error: 'path_not_found' };
    }

    const stat = fs.statSync(p);
    if (!stat.isDirectory()) {
      return { ok: false, error: 'not_a_directory' };
    }

    const items = [];

    const readDir = (dirPath, depth = 0) => {
      const entries = fs.readdirSync(dirPath);

      for (const entry of entries) {
        if (entry.startsWith('.')) continue;

        const fullPath = path.join(dirPath, entry);
        const stat = fs.statSync(fullPath);

        items.push({
          name: entry,
          type: stat.isDirectory() ? 'dir' : 'file',
          path: fullPath
        });

        if (recursive && stat.isDirectory() && depth < 3) {
          readDir(fullPath, depth + 1);
        }
      }
    };

    readDir(p);

    return {
      ok: true,
      path: p,
      items: items.slice(0, 100),
      count: items.length
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = {
  fileRead,
  fileWrite,
  fileEdit,
  fileGlob,
  fileGrep,
  folderBrowse,
  matchesGlobPattern,
  findFiles,
  escapeRegExp
};
