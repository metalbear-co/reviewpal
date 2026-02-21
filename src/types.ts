/**
 * Core types for ReviewPal
 */

export interface DiffHunk {
  filename: string;
  fileDiffHash?: string;
  startLine: number;
  endLine: number;
  content: string;
  additions: string[];
  deletions: string[];
  context: string;
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

export interface AIReview {
  summary: string;
  critical: Array<{
    type: 'outage' | 'corruption' | 'security';
    line: number;
    issue: string;
    friendlySuggestion: string;
  }>;
  language: string;
}

export interface HunkAnalysis {
  hunk: DiffHunk;
  aiReview?: AIReview;
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
    type: 'outage' | 'corruption' | 'security';
    line: number;
    issue: string;
    friendlySuggestion: string;
  }>;
  language: string;
}

export interface AdversarialFinding {
  persona: string;
  filename: string;
  type: 'outage' | 'corruption' | 'security';
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

export interface ReviewResult {
  files: FileAnalysis[];
  totalHunks: number;
  totalProcessingTime: number;
  triage?: TriageResult;
  deepReviews?: DeepReviewResult[];
  adversarialFindings?: AdversarialFinding[];
  verdict?: VerdictResult;
}

export interface FileAnalysis {
  filename: string;
  hunks: HunkAnalysis[];
  overallComplexity: number;
}

export type OutputFormat = 'friendly' | 'json';
