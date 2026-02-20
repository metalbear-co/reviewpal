/**
 * Claude API wrapper for AI code review
 */
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
/**
 * Initialize Claude client
 */
export declare function initClaudeClient(apiKey?: string): void;
/**
 * Review code with AI (language agnostic)
 * Accepts full unified diff (with +/- prefixes) instead of just additions
 */
export declare function reviewCode(code: string, filename: string, model?: string, architectureContext?: string): Promise<AIReview>;
/**
 * Reply to a user's question about a code review comment
 */
export declare function replyToComment(question: string, originalComment: string, codeContext: string, model?: string): Promise<string>;
//# sourceMappingURL=claude.d.ts.map