/**
 * Core types for AI Review Helper
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
export interface SummaryAnalysis {
    what: string;
    why: string;
    watch: string[];
}
export interface PatternMatch {
    type: PatternType;
    lines: number[];
    issue: string;
    simplerAlternative?: string;
}
export type PatternType = 'over-defensive' | 'verbose-comments' | 'over-abstraction' | 'naming-chaos' | 'import-bloat' | 'monolithic-function' | 'catch-all-error';
export interface PatternAnalysis {
    patternsFound: PatternMatch[];
    overallAiLikelihood: 'high' | 'medium' | 'low';
    keyQuestion?: string;
}
export interface ComplexityMetrics {
    nestingDepth: number;
    cyclomaticComplexity: number;
    parameterCount: number;
    lineCount: number;
    dependencyCount: number;
}
export interface ComplexityAnalysis {
    score: number;
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
export interface AIReview {
    summary: string;
    critical: Array<{
        type: 'security' | 'crash' | 'data-loss' | 'performance';
        line: number;
        issue: string;
        friendlySuggestion: string;
    }>;
    language: string;
}
export interface HunkAnalysis {
    hunk: DiffHunk;
    aiReview?: AIReview;
    summary?: SummaryAnalysis;
    patterns?: PatternAnalysis;
    complexity?: ComplexityAnalysis;
    processingTime: number;
}
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
export interface ReviewResult {
    files: FileAnalysis[];
    totalHunks: number;
    totalProcessingTime: number;
    aiCodeLikelihood: 'high' | 'medium' | 'low';
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
export interface ReviewOptions {
    input: string;
    format: OutputFormat;
    verbose: boolean;
    skipSummary: boolean;
    skipPatterns: boolean;
    skipComplexity: boolean;
    maxHunks: number;
    contextLines: number;
}
export type OutputFormat = 'markdown' | 'json' | 'text' | 'github' | 'friendly';
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
export declare const DEFAULT_CONFIG: Config;
//# sourceMappingURL=types.d.ts.map