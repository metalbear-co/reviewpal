/**
 * Deep review pipeline: Phase B
 * Detailed review of high-priority files with full diffs + context
 */
import { GoogleGenAI } from '@google/genai';
import { DiffFile, TriageResult, DeepReviewResult } from '../types.js';
import { ReviewPalConfig } from './context.js';
/**
 * Deep review a single file with its full unified diff
 */
export declare function reviewFile(client: GoogleGenAI, file: DiffFile, triageResult: TriageResult, architectureContext: string, config: ReviewPalConfig, model: string): Promise<DeepReviewResult>;
/**
 * Review prioritized files from triage within an API call budget.
 * Uses Promise.all for parallel execution.
 */
export declare function reviewPrioritizedFiles(client: GoogleGenAI, files: DiffFile[], triageResult: TriageResult, architectureContext: string, config: ReviewPalConfig, model: string, maxCalls: number): Promise<DeepReviewResult[]>;
//# sourceMappingURL=deep-review.d.ts.map