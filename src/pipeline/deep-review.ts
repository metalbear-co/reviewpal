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

Report ONLY issues that would cause a PRODUCTION OUTAGE, DATA CORRUPTION, or SECURITY BREACH.
The bar is: "Would a senior on-call engineer page the team about this?" If not, don't report it.

STRICT type definitions:
- security: An attacker can exploit this TODAY. You can describe the exact HTTP request or input that triggers it.
- crash: The application process will terminate or an unhandled exception will propagate to the user. NOT "a value might be wrong" or "a component might re-render incorrectly."
- data-loss: User data will be permanently deleted or corrupted. NOT "a cache might be stale."
- performance: The application will become unresponsive or OOM under CURRENT production traffic. NOT "this could be optimized."

Pay attention to BOTH additions and deletions. A deletion that removes important validation or error handling is a critical issue.

Do NOT report (these are NEVER findings):
- Style, naming, minor optimizations, comments, test files
- Architectural suggestions or "better ways" to do something (e.g., "move filtering to server", "use server-side pagination")
- Hypothetical issues that require unusual inputs, malformed data, or unlikely conditions
- Missing error handling where the failure would correctly surface as a visible bug (not silent corruption)
- Performance issues that only matter at scale the project hasn't reached
- React/frontend best practices: key props, memoization, re-render optimization, prop drilling
- Missing null checks on values that come from the application's own code (not external input)
- Polling intervals, refetch frequencies, or caching strategies (these are product decisions, not bugs)
- Client-side localStorage/sessionStorage parsing (users can't cause server outages with bad localStorage)

SELF-CHECK: Before including ANY finding, ask yourself:
1. Can I describe the EXACT sequence of normal user actions that triggers this?
2. Would the result be an outage, data loss, or security breach (not just a console error or wrong UI state)?
3. Would a senior engineer agree this is a production incident, not a code quality nit?
If any answer is NO, do not include it.

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

Return an empty critical array unless you are HIGHLY confident the issue would cause a production incident. Most code is fine. An empty array is the expected, normal result.`;

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
