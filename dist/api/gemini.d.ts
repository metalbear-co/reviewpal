/**
 * Google Gemini API wrapper for AI code review
 */
import { GoogleGenAI } from '@google/genai';
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
 * Create a Gemini client
 */
export declare function createGeminiClient(apiKey?: string): GoogleGenAI;
/**
 * Review code with AI (language agnostic)
 * Accepts full unified diff (with +/- prefixes)
 */
export declare function reviewCode(client: GoogleGenAI, code: string, filename: string, model?: string, architectureContext?: string): Promise<AIReview>;
/**
 * Reply to a user's question about a code review comment
 */
export declare function replyToComment(client: GoogleGenAI, question: string, originalComment: string, codeContext: string, model?: string): Promise<string>;
//# sourceMappingURL=gemini.d.ts.map