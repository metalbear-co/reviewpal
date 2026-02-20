"use strict";
/**
 * Deep review pipeline: Phase B
 * Detailed review of high-priority files with full diffs + context
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewFile = reviewFile;
exports.reviewPrioritizedFiles = reviewPrioritizedFiles;
/**
 * Deep review a single file with its full unified diff
 */
async function reviewFile(client, file, triageResult, architectureContext, config, model) {
    // Combine all hunks into one full diff for the file
    const fullDiff = file.hunks.map(h => h.content).join('\n...\n');
    let contextSection = '';
    if (architectureContext) {
        contextSection = `\nPROJECT CONTEXT:\n${architectureContext}\n`;
    }
    let reviewInstructions = '';
    if (config.review_instructions.length > 0) {
        reviewInstructions = `\nADDITIONAL REVIEW INSTRUCTIONS:\n${config.review_instructions.map(r => `- ${r}`).join('\n')}\n`;
    }
    const prompt = `You are doing a deep code review of a single file as part of a larger PR.

PR SUMMARY: ${triageResult.prSummary}
PR THEMES: ${triageResult.themes.join(', ')}
${contextSection}${reviewInstructions}
The diff uses standard unified diff format:
- Lines starting with "+" are additions (new code)
- Lines starting with "-" are deletions (removed code)
- Lines starting with " " (space) are context (unchanged code)

FULL DIFF for ${file.filename} (+${file.additions}/-${file.deletions}):
\`\`\`diff
${fullDiff.slice(0, 10000)}
\`\`\`

Report CRITICAL issues only:
- Security vulnerabilities (exposed secrets, SQL injection, XSS)
- Will crash in production (unhandled errors, null refs, race conditions)
- Data loss risks (missing validation, destructive ops)
- Major performance problems (N+1 queries, infinite loops, memory leaks)

Pay attention to BOTH additions and deletions. A deletion that removes important validation or error handling is a critical issue.

Ignore: style, naming, minor optimizations, comments, test files.
Do NOT suggest adding try-catch or null checks where a failure would correctly surface a real bug.

Respond in JSON:
{
  "language": "language name",
  "summary": "1-2 sentence summary of what changed in this file",
  "critical": [
    {
      "type": "security|crash|data-loss|performance",
      "line": line_number_in_new_file,
      "issue": "Brief what's wrong (1 sentence)",
      "friendlySuggestion": "Specific, actionable fix suggestion. 1-2 sentences."
    }
  ]
}

If no CRITICAL issues, return empty critical array.`;
    const response = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            maxOutputTokens: 4000,
        },
    });
    const text = response.text || '';
    try {
        const parsed = JSON.parse(text);
        return {
            filename: file.filename,
            summary: parsed.summary || 'Code changes',
            critical: Array.isArray(parsed.critical) ? parsed.critical : [],
            language: parsed.language || 'Unknown',
        };
    }
    catch {
        return { filename: file.filename, summary: 'Unable to analyze', critical: [], language: 'Unknown' };
    }
}
/**
 * Review prioritized files from triage within an API call budget.
 * Uses Promise.all for parallel execution.
 */
async function reviewPrioritizedFiles(client, files, triageResult, architectureContext, config, model, maxCalls) {
    // Match files from triage to actual DiffFile objects
    const prioritizedFiles = [];
    for (const filename of triageResult.highPriorityFiles) {
        const file = files.find(f => f.filename === filename);
        if (file) {
            prioritizedFiles.push(file);
        }
    }
    // If triage didn't return useful results, fall back to largest files
    if (prioritizedFiles.length === 0) {
        prioritizedFiles.push(...files
            .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions))
            .slice(0, maxCalls));
    }
    // Budget: maxCalls minus the 1 triage call already made
    const budget = Math.max(1, maxCalls - 1);
    const filesToReview = prioritizedFiles.slice(0, budget);
    // Run all deep reviews in parallel
    const results = await Promise.all(filesToReview.map(file => reviewFile(client, file, triageResult, architectureContext, config, model)));
    return results;
}
//# sourceMappingURL=deep-review.js.map