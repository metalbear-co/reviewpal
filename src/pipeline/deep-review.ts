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
export async function reviewFile(
  client: GoogleGenAI,
  file: DiffFile,
  triageResult: TriageResult,
  architectureContext: string,
  config: ReviewPalConfig,
  model: string
): Promise<DeepReviewResult> {
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

Report ONLY issues that would cause an INCIDENT if this code were deployed to production.
Ask yourself: "Would this wake someone up at 3am?" If not, don't report it.

CRITICAL means:
- Security: exploitable vulnerability with a concrete attack vector (not theoretical)
- Crash: will throw/panic in production under normal usage (not edge cases that "could" happen)
- Data loss: destructive operation on real data without safeguards
- Performance: will degrade under current production load (not "could be slow someday")

Pay attention to BOTH additions and deletions. A deletion that removes important validation or error handling is a critical issue.

Do NOT report:
- Style, naming, minor optimizations, comments, test files
- Architectural suggestions or "better ways" to do something
- Hypothetical issues that require unusual inputs or unlikely conditions
- Missing error handling where the failure would correctly surface a real bug
- Performance issues that only matter at scale the project hasn't reached

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
  } catch {
    return { filename: file.filename, summary: 'Unable to analyze', critical: [], language: 'Unknown' };
  }
}

/**
 * Review prioritized files from triage within an API call budget.
 * Uses Promise.all for parallel execution.
 */
export async function reviewPrioritizedFiles(
  client: GoogleGenAI,
  files: DiffFile[],
  triageResult: TriageResult,
  architectureContext: string,
  config: ReviewPalConfig,
  model: string,
  maxCalls: number
): Promise<DeepReviewResult[]> {
  // Match files from triage to actual DiffFile objects
  const prioritizedFiles: DiffFile[] = [];
  for (const filename of triageResult.highPriorityFiles) {
    const file = files.find(f => f.filename === filename);
    if (file) {
      prioritizedFiles.push(file);
    }
  }

  // If triage didn't return useful results, fall back to largest files
  if (prioritizedFiles.length === 0) {
    prioritizedFiles.push(
      ...files
        .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions))
        .slice(0, maxCalls)
    );
  }

  // Budget: maxCalls minus the 1 triage call already made
  const budget = Math.max(1, maxCalls - 1);
  const filesToReview = prioritizedFiles.slice(0, budget);

  // Run all deep reviews in parallel
  const results = await Promise.all(
    filesToReview.map(file =>
      reviewFile(client, file, triageResult, architectureContext, config, model)
    )
  );

  return results;
}
