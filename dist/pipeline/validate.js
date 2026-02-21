"use strict";
/**
 * Validation pipeline: final pass
 * Takes all findings from deep review + adversarial and validates them
 * against the actual diff to filter out false positives before posting.
 * Uses one LLM call to review all findings at once.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateFindings = validateFindings;
/**
 * Validate all findings by sending them back to the LLM with
 * the relevant code context. Removes false positives.
 */
async function validateFindings(client, files, deepReviews, adversarialFindings, model) {
    // Collect all findings into a flat list
    const allFindings = [];
    for (const review of deepReviews) {
        for (let i = 0; i < review.critical.length; i++) {
            const c = review.critical[i];
            allFindings.push({
                id: `deep-${review.filename}-${i}`,
                source: 'deep',
                filename: review.filename,
                line: c.line,
                type: c.type,
                issue: c.issue,
                suggestion: c.friendlySuggestion,
            });
        }
    }
    for (let i = 0; i < adversarialFindings.length; i++) {
        const f = adversarialFindings[i];
        allFindings.push({
            id: `adv-${f.filename}-${i}`,
            source: 'adversarial',
            filename: f.filename,
            line: f.line,
            type: f.type,
            issue: f.issue,
            suggestion: f.friendlySuggestion,
        });
    }
    // Nothing to validate
    if (allFindings.length === 0) {
        return { deepReviews, adversarialFindings, filteredCount: 0 };
    }
    // Build code context for each finding
    const findingsWithContext = allFindings.map(f => {
        const file = files.find(df => df.filename === f.filename);
        let codeSnippet = '(file not found in diff)';
        if (file) {
            const fullDiff = file.hunks.map(h => h.content).join('\n...\n');
            codeSnippet = fullDiff.slice(0, 3000);
        }
        return { ...f, codeSnippet };
    });
    const findingsList = findingsWithContext.map((f, idx) => {
        return `### Finding ${idx + 1}: [${f.id}]
- **File**: ${f.filename}:${f.line}
- **Type**: ${f.type}
- **Issue**: ${f.issue}
- **Suggestion**: ${f.suggestion}
- **Code**:
\`\`\`diff
${f.codeSnippet}
\`\`\``;
    }).join('\n\n');
    const prompt = `You are a senior engineer doing a FINAL quality check on code review findings before they get posted to a PR.
Your ONLY job is to filter out false positives. You are the last line of defense against bad findings that would annoy developers and erode trust in the tool.

Here are ${allFindings.length} finding(s) to validate:

${findingsList}

For EACH finding, determine if it is a TRUE POSITIVE or FALSE POSITIVE.

A finding is a FALSE POSITIVE if ANY of these apply:
- The line number doesn't exist in the file or points to the wrong code
- The issue described doesn't match what the code actually does
- The code already handles the case the finding warns about (e.g., already uses optional chaining, already has a null check)
- The field/variable is guaranteed to exist by the type system or API contract
- It's an architectural suggestion, not a bug (e.g., "move X to server", "add pagination")
- It's about code style or best practices, not a production incident
- The "outage" would actually be caught by an error boundary or try-catch and not crash the process
- The finding is about a generated file, config file, or lock file, not source code

A finding is a TRUE POSITIVE only if:
- The issue is real: you can describe the exact input or state that triggers it
- The line number points to code that actually has the problem
- The result would be a production outage, data loss, or security breach
- The code does NOT already handle this case

Respond in JSON:
{
  "validations": [
    {
      "id": "the finding id",
      "keep": true or false,
      "reason": "1 sentence explaining why this is real or false positive"
    }
  ]
}

Be AGGRESSIVE about filtering. When in doubt, filter it out. A missed true positive is less harmful than a posted false positive. Developers stop reading reviews that cry wolf.`;
    const response = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            maxOutputTokens: 2000,
        },
    });
    const text = response.text || '';
    try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed.validations)) {
            return { deepReviews, adversarialFindings, filteredCount: 0 };
        }
        // Build set of IDs to keep
        const keepIds = new Set();
        for (const v of parsed.validations) {
            if (v.keep) {
                keepIds.add(v.id);
            }
        }
        // Filter deep reviews
        const filteredDeepReviews = deepReviews.map(review => {
            const filteredCritical = review.critical.filter((_, i) => {
                const id = `deep-${review.filename}-${i}`;
                return keepIds.has(id);
            });
            return { ...review, critical: filteredCritical };
        });
        // Filter adversarial findings
        const filteredAdversarial = adversarialFindings.filter((f, i) => {
            const id = `adv-${f.filename}-${i}`;
            return keepIds.has(id);
        });
        const originalCount = allFindings.length;
        const keptCount = keepIds.size;
        return {
            deepReviews: filteredDeepReviews,
            adversarialFindings: filteredAdversarial,
            filteredCount: originalCount - keptCount,
        };
    }
    catch {
        // If validation fails, pass through all findings unfiltered
        return { deepReviews, adversarialFindings, filteredCount: 0 };
    }
}
//# sourceMappingURL=validate.js.map