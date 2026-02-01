/**
 * Claude API wrapper for AI code review
 */
export interface AIReview {
    explanation: string;
    concerns: string[];
    language: string;
}
/**
 * Initialize Claude client
 */
export declare function initClaudeClient(apiKey?: string): void;
/**
 * Review code with AI (language agnostic)
 */
export declare function reviewCode(code: string, filename: string, model?: string): Promise<AIReview>;
//# sourceMappingURL=claude.d.ts.map