/**
 * Core types for AI Review Helper
 */

export interface DiffHunk {
  filename: string;
  startLine: number;
  endLine: number;
  content: string;
  additions: string[];
  deletions: string[];
  context: string;  // surrounding code
}

export interface ParsedDiff {
  files: DiffFile[];
}

export interface DiffFile {
  filename: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

// Solution 1: What Changed & Why
export interface SummaryAnalysis {
  what: string;      // What behavior changed
  why: string;       // Likely intent/purpose
  watch: string[];   // Things to verify (1-3 items)
}

// Solution 2: Pattern Decoder
export interface PatternMatch {
  type: PatternType;
  lines: number[];
  issue: string;
  simplerAlternative?: string;
}

export type PatternType = 
  | 'over-defensive'
  | 'verbose-comments'
  | 'over-abstraction'
  | 'naming-chaos'
  | 'import-bloat'
  | 'monolithic-function'
  | 'catch-all-error';

export interface PatternAnalysis {
  patternsFound: PatternMatch[];
  overallAiLikelihood: 'high' | 'medium' | 'low';
  keyQuestion?: string;
}

// Solution 4: Complexity Highlighter
export interface ComplexityMetrics {
  nestingDepth: number;
  cyclomaticComplexity: number;
  parameterCount: number;
  lineCount: number;
  dependencyCount: number;
}

export interface ComplexityAnalysis {
  score: number;  // 0-10, higher = more complex
  metrics: ComplexityMetrics;
  flags: ComplexityFlag[];
  suggestions: string[];
}

export interface ComplexityFlag {
  metric: keyof ComplexityMetrics;
  value: number;
  threshold: number;
  severity: 'warning' | 'critical';
}

// AI Review
export interface AIReview {
  explanation: string;  // Human-friendly explanation of what this does
  concerns: string[];   // List of concerns written naturally
  language: string;
}

// Combined analysis result for a hunk
export interface HunkAnalysis {
  hunk: DiffHunk;
  aiReview?: AIReview;
  summary?: SummaryAnalysis;
  patterns?: PatternAnalysis;
  complexity?: ComplexityAnalysis;
  processingTime: number;
}

// Full review result
export interface ReviewResult {
  files: FileAnalysis[];
  totalHunks: number;
  totalProcessingTime: number;
  aiCodeLikelihood: 'high' | 'medium' | 'low';
}

export interface FileAnalysis {
  filename: string;
  hunks: HunkAnalysis[];
  overallComplexity: number;
}

// CLI Options
export interface ReviewOptions {
  input: string;           // diff input (file, stdin, or git range)
  format: OutputFormat;
  verbose: boolean;
  skipSummary: boolean;
  skipPatterns: boolean;
  skipComplexity: boolean;
  maxHunks: number;
  contextLines: number;
}

export type OutputFormat = 'markdown' | 'json' | 'text' | 'github' | 'friendly';

// Config file
export interface Config {
  anthropicApiKey?: string;
  model: string;
  complexityThresholds: ComplexityThresholds;
  enabledAnalyzers: {
    summary: boolean;
    patterns: boolean;
    complexity: boolean;
  };
}

export interface ComplexityThresholds {
  nestingDepth: number;
  cyclomaticComplexity: number;
  parameterCount: number;
  lineCount: number;
  dependencyCount: number;
}

export const DEFAULT_CONFIG: Config = {
  model: 'claude-sonnet-4-20250514',
  complexityThresholds: {
    nestingDepth: 3,
    cyclomaticComplexity: 10,
    parameterCount: 4,
    lineCount: 50,
    dependencyCount: 10
  },
  enabledAnalyzers: {
    summary: true,
    patterns: true,
    complexity: true
  }
};
