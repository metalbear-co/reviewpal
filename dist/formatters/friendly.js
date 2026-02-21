"use strict";
/**
 * Human-friendly output format (brief, critical-only)
 * Supports both legacy per-hunk output and new triage pipeline output
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatFriendlyReviewResult = formatFriendlyReviewResult;
const EMOJI_MAP = {
    security: '🔒',
    crash: '💥',
    'data-loss': '🗑️',
    performance: '🐌',
    regression: '🔄',
    logic: '🧩'
};
const VERDICT_EMOJI = {
    BLOCK: '🔴',
    WARN: '🟡',
    CLEAR: '🟢',
};
function formatFriendlyReviewResult(result) {
    // Use new triage-based format if triage data is available
    if (result.triage) {
        return formatTriageResult(result);
    }
    // Legacy per-hunk format
    return formatLegacyResult(result);
}
/**
 * New triage pipeline output format
 */
function formatTriageResult(result) {
    const parts = [];
    const triage = result.triage;
    // Get PR context from environment (set by GitHub Action)
    const repo = process.env.GITHUB_REPOSITORY || '';
    const prNumber = process.env.PR_NUMBER || '';
    // Verdict (if present)
    if (result.verdict) {
        const emoji = VERDICT_EMOJI[result.verdict.verdict] || '⚪';
        parts.push(`## ${emoji} Verdict: ${result.verdict.verdict}\n`);
        parts.push(`> ${result.verdict.reason}\n`);
    }
    // PR Summary
    parts.push(`**What does this PR do?** ${triage.prSummary}\n`);
    if (triage.themes.length > 0) {
        parts.push(`*Themes: ${triage.themes.join(', ')}*\n`);
    }
    // Cross-system implications
    if (triage.crossSystemImplications.length > 0) {
        parts.push(`\n**⚡ Cross-System Implications:**\n`);
        for (const impl of triage.crossSystemImplications) {
            const riskEmoji = impl.risk === 'high' ? '🔴' : impl.risk === 'medium' ? '🟡' : '🟢';
            parts.push(`- ${riskEmoji} ${impl.description}`);
            if (impl.filesInvolved.length > 0) {
                parts.push(`  Files: ${impl.filesInvolved.join(', ')}`);
            }
        }
        parts.push('');
    }
    // Collect all critical issues from deep reviews
    let hasCriticalIssues = false;
    if (result.deepReviews) {
        for (const review of result.deepReviews) {
            if (review.critical.length > 0) {
                if (!hasCriticalIssues) {
                    parts.push(`\n**🚨 Critical Issues:**\n`);
                    hasCriticalIssues = true;
                }
                // Find the diff hash for GitHub linking
                const fileData = result.files.find(f => f.filename === review.filename);
                const fileDiffHash = fileData?.hunks[0]?.hunk?.fileDiffHash;
                for (const item of review.critical) {
                    const emoji = EMOJI_MAP[item.type] || '⚠️';
                    let lineLink = `line ${item.line}`;
                    if (repo && prNumber && fileDiffHash) {
                        const diffUrl = `https://github.com/${repo}/pull/${prNumber}/files#diff-${fileDiffHash}R${item.line}`;
                        lineLink = `[${review.filename}:${item.line}](${diffUrl})`;
                    }
                    parts.push(`- ${emoji} **${item.type.toUpperCase()}**: ${item.issue} → ${lineLink}\n`);
                }
            }
        }
    }
    // Adversarial findings
    if (result.adversarialFindings && result.adversarialFindings.length > 0) {
        parts.push(`\n**🎭 Adversarial Review Findings:**\n`);
        for (const finding of result.adversarialFindings) {
            const emoji = EMOJI_MAP[finding.type] || '⚠️';
            const fileData = result.files.find(f => f.filename === finding.filename);
            const fileDiffHash = fileData?.hunks[0]?.hunk?.fileDiffHash;
            let lineLink = `line ${finding.line}`;
            if (repo && prNumber && fileDiffHash) {
                const diffUrl = `https://github.com/${repo}/pull/${prNumber}/files#diff-${fileDiffHash}R${finding.line}`;
                lineLink = `[${finding.filename}:${finding.line}](${diffUrl})`;
            }
            parts.push(`- ${emoji} **${finding.type.toUpperCase()}** *(${finding.persona})*: ${finding.issue} → ${lineLink}\n`);
        }
    }
    // Files reviewed summary
    if (result.deepReviews && result.deepReviews.length > 0) {
        const skipped = result.totalHunks - (result.deepReviews.length || 0);
        if (skipped > 0) {
            parts.push(`\n*Reviewed ${result.deepReviews.length} priority files out of ${result.files.length + skipped} total.*\n`);
        }
    }
    if (!hasCriticalIssues && (!result.adversarialFindings || result.adversarialFindings.length === 0)) {
        if (!result.verdict || result.verdict.verdict === 'CLEAR') {
            return parts.join('\n') + '\n\n✅ No critical issues found!';
        }
    }
    return parts.join('\n');
}
/**
 * Legacy per-hunk format (backward compatible)
 */
function formatLegacyResult(result) {
    const parts = [];
    // Get PR context from environment (set by GitHub Action)
    const repo = process.env.GITHUB_REPOSITORY || '';
    const prNumber = process.env.PR_NUMBER || '';
    let hasCriticalIssues = false;
    for (const file of result.files) {
        if (file.hunks.length === 0)
            continue;
        for (const hunk of file.hunks) {
            if (!hunk.aiReview)
                continue;
            const { summary, critical, language } = hunk.aiReview;
            // Summary (brief!)
            if (!hasCriticalIssues) {
                parts.push(`**What does this PR do?** ${summary}\n`);
                if (language && language !== 'Unknown') {
                    parts.push(`*${language}*\n`);
                }
            }
            // Critical issues
            if (critical.length > 0) {
                if (!hasCriticalIssues) {
                    parts.push(`\n**🚨 Critical Issues:**\n`);
                    hasCriticalIssues = true;
                }
                critical.forEach((item) => {
                    const emoji = EMOJI_MAP[item.type] || '⚠️';
                    // Generate GitHub diff link to specific line
                    let lineLink = `line ${item.line}`;
                    if (repo && prNumber && hunk.hunk.fileDiffHash) {
                        // GitHub format: /pull/{pr}/files#diff-{hash}R{line}
                        const diffUrl = `https://github.com/${repo}/pull/${prNumber}/files#diff-${hunk.hunk.fileDiffHash}R${item.line}`;
                        lineLink = `[${file.filename}:${item.line}](${diffUrl})`;
                    }
                    parts.push(`- ${emoji} **${item.type.toUpperCase()}**: ${item.issue} → ${lineLink}\n`);
                });
            }
        }
    }
    if (parts.length === 0) {
        return '✅ Looks good - no critical issues found!';
    }
    if (!hasCriticalIssues) {
        return parts.join('\n') + '\n\n✅ No critical issues found!';
    }
    return parts.join('\n');
}
//# sourceMappingURL=friendly.js.map