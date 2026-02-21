/**
 * Verdict computation
 * Aggregates findings from deep review and adversarial passes
 * into a single BLOCK / WARN / CLEAR verdict.
 */
import { DeepReviewResult, AdversarialFinding, VerdictResult } from '../types.js';
/**
 * Compute a verdict based on all findings.
 *
 * BLOCK: Any security, crash, or data-loss issue found
 * WARN: Only performance/regression/logic issues found
 * CLEAR: No issues found
 */
export declare function computeVerdict(deepReviews: DeepReviewResult[], adversarialFindings: AdversarialFinding[]): VerdictResult;
//# sourceMappingURL=verdict.d.ts.map