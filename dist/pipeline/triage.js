"use strict";
/**
 * Triage pipeline: Phase A
 * One Gemini call to summarize all changes and identify high-priority files
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTriageSummary = buildTriageSummary;
exports.triagePR = triagePR;
/**
 * Build a condensed summary of all changed files for the triage call.
 * Includes filename, +/- stats, and first few lines of each hunk.
 */
function buildTriageSummary(files) {
    const parts = [];
    for (const file of files) {
        parts.push(`### ${file.filename} (+${file.additions}/-${file.deletions})`);
        for (const hunk of file.hunks) {
            // Show first 5 lines of each hunk to give the model a sense of the change
            const lines = hunk.content.split('\n').slice(0, 5);
            parts.push(lines.join('\n'));
            if (hunk.content.split('\n').length > 5) {
                parts.push('  ...');
            }
        }
        parts.push('');
    }
    return parts.join('\n');
}
/**
 * Run the triage phase: one Gemini call that sees all changes condensed.
 * Returns: PR summary, themes, high-priority files, cross-system implications.
 */
async function triagePR(client, files, architectureContext, config, model) {
    const summary = buildTriageSummary(files);
    const fileList = files.map(f => `- ${f.filename} (+${f.additions}/-${f.deletions})`).join('\n');
    let crossSystemRules = '';
    if (config.focus_areas.length > 0) {
        crossSystemRules = `\nCROSS-SYSTEM RULES (from project config):\n${config.focus_areas.map(r => `- ${r}`).join('\n')}\n\nUse these rules to detect when a change in one area requires matching changes elsewhere.\n`;
    }
    const prompt = `You are a senior code reviewer performing triage on a pull request. Your job is to:
1. Summarize what this PR does overall (2-3 sentences)
2. Identify the key themes/areas of change
3. Pick which files deserve deep review (most likely to have bugs, security issues, or architectural problems)
4. Flag any cross-system implications where a change in one file requires matching updates elsewhere

${architectureContext ? `PROJECT CONTEXT:\n${architectureContext}\n` : ''}${crossSystemRules}
ALL CHANGED FILES:
${fileList}

CONDENSED CHANGES:
${summary.slice(0, 12000)}

Respond in JSON:
{
  "prSummary": "2-3 sentence summary of what this PR does overall",
  "themes": ["theme1", "theme2"],
  "highPriorityFiles": ["file1.ts", "file2.rs"],
  "crossSystemImplications": [
    {
      "description": "What cross-system concern exists",
      "filesInvolved": ["file1.ts", "file2.ts"],
      "risk": "high|medium|low"
    }
  ]
}

Guidelines:
- highPriorityFiles: Pick files most likely to have bugs or critical issues. Prioritize production code over tests/configs. Max 8 files.
- crossSystemImplications: Flag when a protocol/API/type change in one file needs matching updates in other files. Only flag if the changes are incomplete or risky.
- If this is a small PR with few files, still list the most important ones for deep review.`;
    const response = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            maxOutputTokens: 1500,
        },
    });
    const text = response.text || '';
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return defaultTriageResult(files);
        }
        const parsed = JSON.parse(jsonMatch[0]);
        return {
            prSummary: parsed.prSummary || 'PR changes',
            themes: Array.isArray(parsed.themes) ? parsed.themes : [],
            highPriorityFiles: Array.isArray(parsed.highPriorityFiles)
                ? parsed.highPriorityFiles.filter((f) => typeof f === 'string')
                : files.slice(0, 8).map(f => f.filename),
            crossSystemImplications: Array.isArray(parsed.crossSystemImplications)
                ? parsed.crossSystemImplications
                : [],
        };
    }
    catch {
        return defaultTriageResult(files);
    }
}
function defaultTriageResult(files) {
    return {
        prSummary: 'Unable to triage PR',
        themes: [],
        highPriorityFiles: files.slice(0, 8).map(f => f.filename),
        crossSystemImplications: [],
    };
}
//# sourceMappingURL=triage.js.map