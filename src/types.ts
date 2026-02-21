/**
 * Core types for AI Review Helper
 */

export interface DiffHunk {
  filename: string;
  fileDiffHash?: string;  // GitHub's diff hash for linking
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
  summary: string;      // 1 sentence: what is this PR
  critical: Array<{
    type: 'security' | 'crash' | 'data-loss' | 'performance';
    line: number;
    issue: string;
    friendlySuggestion: string;
  }>;
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

// Triage pipeline types
export interface TriageResult {
  prSummary: string;
  themes: string[];
  highPriorityFiles: string[];
  crossSystemImplications: CrossSystemImplication[];
}

export interface CrossSystemImplication {
  description: string;
  filesInvolved: string[];
  risk: 'high' | 'medium' | 'low';
}

export interface DeepReviewResult {
  filename: string;
  summary: string;
  critical: Array<{
    type: 'security' | 'crash' | 'data-loss' | 'performance';
    line: number;
    issue: string;
    friendlySuggestion: string;
  }>;
  language: string;
}

export interface AdversarialFinding {
  persona: string;
  filename: string;
  type: 'security' | 'crash' | 'data-loss' | 'performance' | 'regression' | 'logic';
  line: number;
  issue: string;
  friendlySuggestion: string;
}

export type Verdict = 'BLOCK' | 'WARN' | 'CLEAR';

export interface VerdictResult {
  verdict: Verdict;
  reason: string;
  criticalCount: number;
  warningCount: number;
}

// Full review result
export interface ReviewResult {
  files: FileAnalysis[];
  totalHunks: number;
  totalProcessingTime: number;
  aiCodeLikelihood: 'high' | 'medium' | 'low';
  // Triage pipeline fields
  triage?: TriageResult;
  deepReviews?: DeepReviewResult[];
  // Adversarial review + verdict
  adversarialFindings?: AdversarialFinding[];
  verdict?: VerdictResult;
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
  geminiApiKey?: string;
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
  model: 'gemini-2.5-pro',
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
