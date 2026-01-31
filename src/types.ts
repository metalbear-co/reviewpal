/**
 * Core types for AI PR Helper
 */

export interface PRFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
}

export interface PRData {
  number: number;
  title: string;
  body: string | null;
  draft: boolean;
  state: 'open' | 'closed';
  additions: number;
  deletions: number;
  changed_files: number;
  files: PRFile[];
  base: {
    ref: string;
    sha: string;
  };
  head: {
    ref: string;
    sha: string;
  };
  user: {
    login: string;
  };
}

export interface SizeEstimate {
  totalLines: number;
  additions: number;
  deletions: number;
  fileCount: number;
  estimatedReadTimeMinutes: number;
  cognitiveComplexity: 'low' | 'medium' | 'high' | 'very-high';
  isTooLarge: boolean;
  recommendation: 'ok' | 'warning' | 'split-required';
}

export interface SplitSuggestion {
  name: string;
  description: string;
  files: string[];
  lineRange: { start: number; end: number };
  estimatedReadTimeMinutes: number;
  bulletPoints: string[];
}

export interface IntentGroup {
  id: string;
  name: string;
  summary: string;
  reason: string;
  files: string[];
  lineRange: { start: number; end: number };
  details: string;
  watchOutFor: string[];
  diagram?: string;
}

export interface PRSummary {
  totalChanges: number;
  estimatedReadTimeMinutes: number;
  groups: IntentGroup[];
}

/**
 * Severity levels for inline comments
 */
export type Severity = 'explanation' | 'warning' | 'bug' | 'security' | 'suggestion';

/**
 * Inline comment for a specific line in the diff
 */
export interface InlineComment {
  file: string;
  line: number;
  body: string;
  severity: Severity;
  title: string;
}

/**
 * Analysis result with inline comments
 */
export interface InlineAnalysis {
  comments: InlineComment[];
  estimatedReadTimeMinutes: number;
}

export interface CommentContext {
  commentId: number;
  body: string;
  user: string;
  path?: string;
  line?: number;
  diffHunk?: string;
  prNumber: number;
}

export interface Config {
  anthropicApiKey: string;
  githubToken: string;
  mode: 'auto' | 'draft-only' | 'ready-only' | 'interactive-only';
  maxLines: number;
  maxReadTimeMinutes: number;
  model: string;
}

export interface ActionContext {
  eventName: string;
  action: string;
  prNumber?: number;
  commentId?: number;
  repo: {
    owner: string;
    repo: string;
  };
}

// Language complexity weights for read time estimation
export const LANGUAGE_COMPLEXITY: Record<string, number> = {
  // Lower = easier to read
  'js': 1.0,
  'jsx': 1.0,
  'ts': 1.1,
  'tsx': 1.1,
  'json': 0.5,
  'md': 0.3,
  'yaml': 0.6,
  'yml': 0.6,
  'css': 0.7,
  'scss': 0.8,
  'html': 0.6,
  // Higher = harder to read
  'rs': 1.5,
  'go': 1.2,
  'py': 1.0,
  'rb': 1.0,
  'java': 1.3,
  'kt': 1.2,
  'swift': 1.2,
  'c': 1.6,
  'cpp': 1.7,
  'h': 1.5,
  'hpp': 1.6,
};

// Default complexity for unknown languages
export const DEFAULT_COMPLEXITY = 1.0;

// Base reading speed (lines per minute for average code)
export const BASE_READING_SPEED = 50;
