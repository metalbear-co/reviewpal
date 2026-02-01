"use strict";
/**
 * Human-friendly output format
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatFriendlyReviewResult = formatFriendlyReviewResult;
function formatFriendlyReviewResult(result) {
    const parts = [];
    for (const file of result.files) {
        if (file.hunks.length === 0)
            continue;
        parts.push(`### 📄 \`${file.filename}\`\n`);
        for (const hunk of file.hunks) {
            if (!hunk.aiReview)
                continue;
            const { explanation, concerns, language } = hunk.aiReview;
            // What is this?
            parts.push(`**What's this?** ${explanation}\n`);
            if (language && language !== 'Unknown') {
                parts.push(`*Language: ${language}*\n`);
            }
            // Concerns (if any)
            if (concerns.length > 0) {
                parts.push(`\n**Things to look at:**\n`);
                concerns.forEach((concern, i) => {
                    parts.push(`${i + 1}. ${concern}\n`);
                });
            }
            else {
                parts.push(`\n✅ Looks good to me!\n`);
            }
            parts.push('---\n');
        }
    }
    if (parts.length === 0) {
        return 'No changes to review.';
    }
    return parts.join('\n');
}
//# sourceMappingURL=friendly.js.map