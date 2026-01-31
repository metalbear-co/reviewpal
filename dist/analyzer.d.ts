/**
 * Intent Analyzer - Analyzes PR changes and generates inline diff comments
 *
 * Feature 2: Smart PR Breakdown (Opus-Powered)
 */
import type { PRData, PRSummary, InlineAnalysis, Severity } from './types.js';
import { ClaudeClient } from './anthropic.js';
/**
 * Get emoji for severity
 */
export declare function getEmojiForSeverity(severity: Severity): string;
/**
 * Analyze PR and generate inline comments using Claude
 */
export declare function analyzeInline(pr: PRData, claude: ClaudeClient): Promise<InlineAnalysis>;
/**
 * Analyze PR and group changes by intent using Claude (legacy format)
 */
export declare function analyzePR(pr: PRData, claude: ClaudeClient): Promise<PRSummary>;
/**
 * Format index comment with navigation links to inline comments
 */
export declare function formatIndexComment(analysis: InlineAnalysis, commentLinks: Array<{
    path: string;
    line: number;
    title: string;
    severity: Severity;
    body: string;
}>): string;
/**
 * Format PR summary as a GitHub comment with clickable navigation
 */
export declare function formatSummaryComment(summary: PRSummary, prNumber: number): string;
