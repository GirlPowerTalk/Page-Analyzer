import React from 'react';
export function getHighlightedDiff(oldText: string, newText: string): string {
  const diff: string[] = [];
  let i = 0, j = 0;

  while (i < oldText.length || j < newText.length) {
    if (oldText[i] === newText[j]) {
      diff.push(oldText[i]); // common character
      i++;
      j++;
    } else {
      if (i < oldText.length) {
        diff.push(`<del style="color: red; background: #ffe6e6;">${oldText[i]}</del>`);
        i++;
      }
      if (j < newText.length) {
        diff.push(`<ins style="color: green; background: #d4f7d4; text-decoration: none;">${newText[j]}</ins>`);
        j++;
      }
    }
  }

  return diff.join("");
}

/**
 * Represents a change in text
 */
export interface TextChange {
  type: 'insertion' | 'deletion';
  text: string;
  position: number;
  originalPosition?: number;
  isGrouped?: boolean;
  isReplacement?: boolean;
  replacementGroup?: string;
}

/**
 * Tokenizes text into an array of {text, index} tokens where tokens are either
 * whitespace sequences or non-whitespace sequences so we preserve spacing.
 */
function tokenize(text: string): { text: string; index: number }[] {
  const regex = /(\s+|[^\s]+)/g;
  const tokens: { text: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    tokens.push({ text: match[0], index: match.index });
  }
  return tokens;
}

/**
 * Find differences between originalText and editedText using a token-level LCS-based approach.
 * Returns a list of insertions and deletions with character positions relative to the original texts.
 */
export function findTextDifferences(originalText: string, editedText: string): TextChange[] {
  if (originalText === editedText) return [];

  const a = tokenize(originalText);
  const b = tokenize(editedText);

  const n = a.length;
  const m = b.length;

  // Build LCS DP table
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (a[i].text === b[j].text) dp[i][j] = dp[i + 1][j + 1] + 1;
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const changes: TextChange[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i].text === b[j].text) {
      // matched token
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      // delete a[i]
      changes.push({
        type: 'deletion',
        text: a[i].text,
        position: a[i].index,
        originalPosition: a[i].index
      });
      i++;
    } else {
      // insert b[j]
      changes.push({
        type: 'insertion',
        text: b[j].text,
        position: b[j].index
      });
      j++;
    }
  }

  // remaining deletions
  while (i < n) {
    changes.push({
      type: 'deletion',
      text: a[i].text,
      position: a[i].index,
      originalPosition: a[i].index
    });
    i++;
  }

  // remaining insertions
  while (j < m) {
    changes.push({
      type: 'insertion',
      text: b[j].text,
      position: b[j].index
    });
    j++;
  }

  // Post-process to group deletions+insertions that look like replacements
  const processed: TextChange[] = [];
  let k = 0;
  let replaceId = 0;
  while (k < changes.length) {
    const cur = changes[k];
    const next = changes[k + 1];
    if (cur && next && cur.type === 'deletion' && next.type === 'insertion') {
      // If positions are near (same character index or adjacent), treat as replacement
      if (Math.abs((cur.originalPosition ?? cur.position) - next.position) <= 1) {
        const group = `replace-${replaceId++}`;
        processed.push({ ...cur, isGrouped: true, isReplacement: true, replacementGroup: group });
        processed.push({ ...next, isGrouped: true, isReplacement: true, replacementGroup: group });
        k += 2;
        continue;
      }
    }
    processed.push(cur);
    k++;
  }

  return processed;
}

/**
 * Format text with changes (positions are relative to the 'text' string passed)
 * Returns an array of React nodes that can be rendered.
 */
export function formatTextWithChanges(text: string, changes: TextChange[]): React.ReactNode[] {
  if (!changes || changes.length === 0) return [text];

  const result: React.ReactNode[] = [];
  let lastPos = 0;

  // Sort changes by position ascending
  const sorted = [...changes].sort((a, b) => a.position - b.position);

  for (const c of sorted) {
    const pos = c.position;

    // Add plain text between lastPos and pos
    if (pos > lastPos) {
      result.push(text.substring(lastPos, pos));
    }

    if (c.isReplacement && c.replacementGroup) {
      // For replacements we'll show the deletion (if any) and insertion inline.
      if (c.type === 'deletion') {
        result.push(
          React.createElement('span', {
            key: `del-${pos}-${c.text}`,
            className: "text-red-500 line-through bg-red-50"
          }, c.text)
        );
      } else {
        result.push(
          React.createElement('mark', {
            key: `ins-${pos}-${c.text}`,
            className: "bg-green-200 text-green-800"
          }, c.text)
        );
      }
    } else {
      if (c.type === 'deletion') {
        result.push(
          React.createElement('span', {
            key: `del-${pos}-${c.text}`,
            className: "text-red-500 line-through bg-red-50"
          }, c.text)
        );
      } else {
        result.push(
          React.createElement('mark', {
            key: `ins-${pos}-${c.text}`,
            className: "bg-green-200 text-green-800"
          }, c.text)
        );
      }
    }

    lastPos = pos + c.text.length;
  }

  // append remaining text
  if (lastPos < text.length) {
    result.push(text.substring(lastPos));
  }

  return result;
}

/**
 * Convert content with highlights to simple HTML for exporting/copying
 */
export function convertToHighlightedHTML(content: string, changes: TextChange[]): string {
  if (!changes || changes.length === 0) {
    return content.replace(/\n/g, "<br>");
  }

  // Build HTML progressively
  let html = "";
  let lastPos = 0;
  const sorted = [...changes].sort((a, b) => (a.position - b.position));

  for (const c of sorted) {
    const pos = c.position;
    if (pos > lastPos) {
      html += escapeHtml(content.substring(lastPos, pos));
    }

    if (c.type === 'deletion') {
      html += `<span style="color:#ef4444;text-decoration:line-through;background-color:#fef2f2;">${escapeHtml(c.text)}</span>`;
    } else {
      html += `<span style="background-color:#d1fae5;color:#065f46;">${escapeHtml(c.text)}</span>`;
    }

    lastPos = pos + c.text.length;
  }

  if (lastPos < content.length) {
    html += escapeHtml(content.substring(lastPos));
  }

  // replace newlines with <br>
  return html.replace(/\n/g, "<br>");
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
