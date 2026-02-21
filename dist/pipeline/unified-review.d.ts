/**
 * Unified review pipeline: single API call combining triage + deep review + adversarial.
 * Reduces 4-13 Gemini calls to 1, cutting latency ~50% and cost ~30%.
 */
import { GoogleGenAI } from '@google/genai';
import { DiffFile, TriageResult, DeepReviewResult, AdversarialFinding } from '../types.js';
import { ReviewPalConfig } from './context.js';
interface UnifiedReviewResult {
    triage: TriageResult;
    deepReviews: DeepReviewResult[];
    adversarialFindings: AdversarialFinding[];
}
/**
 * Run a single unified review call that combines triage, deep review, and adversarial.
 */
export declare function runUnifiedReview(client: GoogleGenAI, files: DiffFile[], architectureContext: string, lessonsContext: string, config: ReviewPalConfig, model: string): Promise<UnifiedReviewResult>;
export {};
//# sourceMappingURL=unified-review.d.ts.map