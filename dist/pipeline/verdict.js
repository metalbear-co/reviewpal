"use strict";
/**
 * Verdict computation
 * Aggregates findings from deep review and adversarial passes
 * into a single BLOCK / WARN / CLEAR verdict.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeVerdict = computeVerdict;
const BLOCKING_TYPES = new Set(['security', 'crash', 'data-loss']);
const WARNING_TYPES = new Set(['performance', 'regression', 'logic']);
/**
 * Compute a verdict based on all findings.
 *
 * BLOCK: Any security, crash, or data-loss issue found
 * WARN: Only performance/regression/logic issues found
 * CLEAR: No issues found
 */
function computeVerdict(deepReviews, adversarialFindings) {
    let criticalCount = 0;
    let warningCount = 0;
    // Count deep review findings
    for (const review of deepReviews) {
        for (const issue of review.critical) {
            if (BLOCKING_TYPES.has(issue.type)) {
                criticalCount++;
            }
            else {
                warningCount++;
            }
        }
    }
    // Count adversarial findings
    for (const finding of adversarialFindings) {
        if (BLOCKING_TYPES.has(finding.type)) {
            criticalCount++;
        }
        else {
            warningCount++;
        }
    }
    let verdict;
    let reason;
    if (criticalCount > 0) {
        verdict = 'BLOCK';
        const types = [];
        const allIssues = [
            ...deepReviews.flatMap(r => r.critical),
            ...adversarialFindings,
        ];
        for (const issue of allIssues) {
            if (BLOCKING_TYPES.has(issue.type) && !types.includes(issue.type)) {
                types.push(issue.type);
            }
        }
        reason = `${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} found (${types.join(', ')})`;
    }
    else if (warningCount > 0) {
        reason = `${warningCount} non-critical finding${warningCount > 1 ? 's' : ''} to review`;
        verdict = 'WARN';
    }
    else {
        verdict = 'CLEAR';
        reason = 'No issues found';
    }
    return { verdict, reason, criticalCount, warningCount };
}
//# sourceMappingURL=verdict.js.map