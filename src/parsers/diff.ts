/**
 * Git diff parser - extracts hunks from unified diff format
 */

import { createHash } from 'crypto';
import { DiffHunk, DiffFile, ParsedDiff } from '../types.js';

interface RawHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

/**
 * Parse a unified diff string into structured data
 */
export function parseDiff(diffText: string): ParsedDiff {
  const files: DiffFile[] = [];
  const lines = diffText.split('\n');

  let currentFile: DiffFile | null = null;
  let currentHunk: RawHunk | null = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // New file header: diff --git a/path b/path
    if (line.startsWith('diff --git')) {
      if (currentFile && currentHunk) {
        currentFile.hunks.push(convertHunk(currentHunk, currentFile.filename));
      }
      if (currentFile) {
        files.push(currentFile);
      }

      // Extract filename from diff header
      const match = line.match(/diff --git a\/(.+) b\/(.+)/);
      const filename = match ? match[2] : 'unknown';

      currentFile = {
        filename,
        hunks: [],
        additions: 0,
        deletions: 0
      };
      currentHunk = null;
      i++;
      continue;
    }

    // Skip index, ---, +++ lines
    if (line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++')) {
      i++;
      continue;
    }

    // New hunk header: @@ -old,count +new,count @@
    if (line.startsWith('@@')) {
      if (currentFile && currentHunk) {
        currentFile.hunks.push(convertHunk(currentHunk, currentFile.filename));
      }

      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        currentHunk = {
          oldStart: parseInt(match[1], 10),
          oldLines: match[2] ? parseInt(match[2], 10) : 1,
          newStart: parseInt(match[3], 10),
          newLines: match[4] ? parseInt(match[4], 10) : 1,
          lines: []
        };
      }
      i++;
      continue;
    }

    // Content lines
    if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ') || line === '')) {
      currentHunk.lines.push(line);

      if (currentFile) {
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentFile.additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentFile.deletions++;
        }
      }
    }

    i++;
  }

  // Don't forget the last file and hunk
  if (currentFile && currentHunk) {
    currentFile.hunks.push(convertHunk(currentHunk, currentFile.filename));
  }
  if (currentFile) {
    files.push(currentFile);
  }

  return { files };
}

/**
 * Convert raw hunk data to our DiffHunk format
 */
function convertHunk(raw: RawHunk, filename: string): DiffHunk {
  const additions: string[] = [];
  const deletions: string[] = [];
  const contentLines: string[] = [];

  for (const line of raw.lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions.push(line.substring(1));
      contentLines.push(line);
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions.push(line.substring(1));
      contentLines.push(line);
    } else if (line.startsWith(' ') || line === '') {
      contentLines.push(line);
    }
  }

  // Generate GitHub diff hash (SHA256 of filename)
  const fileDiffHash = createHash('sha256')
    .update(filename)
    .digest('hex');

  return {
    filename,
    fileDiffHash,
    startLine: raw.newStart,
    endLine: raw.newStart + raw.newLines - 1,
    content: contentLines.join('\n'),
    additions,
    deletions,
    context: ''
  };
}
