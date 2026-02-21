/**
 * Validation pipeline: final pass
 * Takes all findings from deep review + adversarial and validates them
 * against the actual diff to filter out false positives before posting.
 * Uses one LLM call to review all findings at once.
 */
import { GoogleGenAI } from '@google/genai';
import { DiffFile, DeepReviewResult, AdversarialFinding } from '../types.js';
interface ValidationResult {
    deepReviews: DeepReviewResult[];
    adversarialFindings: AdversarialFinding[];
    filteredCount: number;
}
/**
 * Validate all findings by sending them back to the LLM with
 * the relevant code context. Removes false positives.
 */
export declare function validateFindings(client: GoogleGenAI, files: DiffFile[], deepReviews: DeepReviewResult[], adversarialFindings: AdversarialFinding[], model: string): Promise<ValidationResult>;
export {};
//# sourceMappingURL=validate.d.ts.map