/**
 * Unified review pipeline: single API call combining triage + deep review + adversarial.
 * Reduces 4-13 Gemini calls to 1, cutting latency ~50% and cost ~30%.
 */

import { GoogleGenAI } from '@google/genai';
import { DiffFile, TriageResult, DeepReviewResult, AdversarialFinding } from '../types.js';
import { ReviewPalConfig } from './context.js';
import { selectPersonas } from './personas.js';

interface UnifiedReviewResult {
  triage: TriageResult;
  deepReviews: DeepReviewResult[];
  adversarialFindings: AdversarialFinding[];
}

interface UnifiedResponse {
  triage?: {
    prSummary?: string;
    themes?: string[];
    highPriorityFiles?: string[];
    crossSystemImplications?: Array<{
      description: string;
      filesInvolved: string[];
      risk: string;
    }>;
  };
  fileReviews?: Array<{
    filename?: string;
    language?: string;
    summary?: string;
    critical?: Array<{
      type?: string;
      line?: number;
      issue?: string;
      friendlySuggestion?: string;
    }>;
  }>;
  adversarialFindings?: Array<{
    persona?: string;
    filename?: string;
    type?: string;
    line?: number;
    issue?: string;
    suggestion?: string;
  }>;
}

const PER_FILE_CHAR_LIMIT = 10_000;
const TOTAL_DIFF_BUDGET = 50_000;

/**
 * Build full diff content for all files, respecting per-file and total budgets.
 * Truncates least-changed files first when over budget.
 */
function buildFullDiffContent(files: DiffFile[]): string {
  // Sort by change size descending so we keep the largest (most important) files
  const sorted = [...files].sort(
    (a, b) => (b.additions + b.deletions) - (a.additions + a.deletions)
  );

  const fileDiffs: Array<{ filename: string; diff: string; changes: number }> = [];
  let totalChars = 0;

  for (const file of sorted) {
    // Add line numbers to each diff line so the LLM can report accurate positions
    const fullDiff = file.hunks.map(h => {
      let lineNum = h.startLine;
      const numberedLines = h.content.split('\n').map(line => {
        if (line.startsWith('-')) {
          // Deleted lines don't have a new-file line number
          return `     ${line}`;
        }
        const numbered = `${String(lineNum).padStart(4)} ${line}`;
        // Context lines (" ") and additions ("+") advance the line counter
        if (line.startsWith('+') || line.startsWith(' ') || line === '') {
          lineNum++;
        }
        return numbered;
      });
      return `@@ starting at line ${h.startLine} @@\n${numberedLines.join('\n')}`;
    }).join('\n...\n');
    const truncatedDiff = fullDiff.slice(0, PER_FILE_CHAR_LIMIT);

    if (totalChars + truncatedDiff.length > TOTAL_DIFF_BUDGET) {
      // Over budget: add a truncated note and stop
      const remaining = TOTAL_DIFF_BUDGET - totalChars;
      if (remaining > 200) {
        fileDiffs.push({
          filename: file.filename,
          diff: fullDiff.slice(0, remaining) + '\n[truncated to fit budget]',
          changes: file.additions + file.deletions,
        });
      }
      break;
    }

    fileDiffs.push({
      filename: file.filename,
      diff: truncatedDiff,
      changes: file.additions + file.deletions,
    });
    totalChars += truncatedDiff.length;
  }

  return fileDiffs
    .map(f => `### ${f.filename}\n\`\`\`diff\n${f.diff}\n\`\`\``)
    .join('\n\n');
}

/**
 * Build the unified mega-prompt combining triage + deep review + adversarial.
 */
function buildUnifiedPrompt(
  files: DiffFile[],
  diffContent: string,
  architectureContext: string,
  lessonsContext: string,
  config: ReviewPalConfig
): string {
  const fileList = files
    .map(f => `- ${f.filename} (+${f.additions}/-${f.deletions})`)
    .join('\n');

  let contextSection = '';
  if (architectureContext) {
    contextSection = `\nPROJECT CONTEXT:\n${architectureContext}\n`;
  }

  let lessonsSection = '';
  if (lessonsContext) {
    lessonsSection = `\nPAST LESSONS (from .reviewpal-lessons.md - do NOT repeat these false positives):\n${lessonsContext}\n`;
  }

  let reviewInstructions = '';
  if (config.review_instructions.length > 0) {
    reviewInstructions = `\nADDITIONAL REVIEW INSTRUCTIONS:\n${config.review_instructions.map(r => `- ${r}`).join('\n')}\n`;
  }

  let crossSystemRules = '';
  if (config.focus_areas.length > 0) {
    crossSystemRules = `\nCROSS-SYSTEM RULES (from project config):\n${config.focus_areas.map(r => `- ${r}`).join('\n')}\n`;
  }

  // Select personas for adversarial section
  const personas = selectPersonas(files);

  const personaInstructions = personas.map((p, i) => {
    const label = String.fromCharCode(65 + i); // A, B, C
    return `**Perspective ${label}: ${p.name}**\n${p.systemPrompt}`;
  }).join('\n\n');

  return `You are performing a comprehensive code review of a pull request. You will complete THREE tasks in a single pass.
${contextSection}${lessonsSection}${reviewInstructions}${crossSystemRules}
The diff uses standard unified diff format:
- Lines starting with "+" are additions (new code)
- Lines starting with "-" are deletions (removed code)
- Lines starting with " " (space) are context (unchanged code)
- Each diff line is prefixed with its ACTUAL line number in the new file (4-digit prefix before the +/-/space)
- Deleted lines ("-") have no line number since they don't exist in the new file

CRITICAL: When reporting line numbers, use the 4-digit number prefixed on each diff line. These are the REAL line numbers in the file after the PR is applied.

ALL CHANGED FILES:
${fileList}

FULL DIFFS:
${diffContent}

${'═'.repeat(60)}
TASK 1: TRIAGE
${'═'.repeat(60)}

Summarize what this PR does (2-3 sentences). Identify key themes. Pick up to 8 high-priority files for deep review (production code over tests/configs). Flag any cross-system implications where changes in one file require matching updates elsewhere.

${'═'.repeat(60)}
TASK 2: DEEP FILE REVIEW
${'═'.repeat(60)}

For each high-priority file you identified in Task 1, provide a detailed review.

Report ONLY issues that would cause a PRODUCTION OUTAGE, DATA CORRUPTION, or SECURITY BREACH.
The bar is: "Would a senior on-call engineer page the team about this?" If not, don't report it.

STRICT type definitions (these are the ONLY valid types):
- outage: The service goes down, process crashes, or requests fail for all users. An unhandled exception that terminates the process. An OOM or infinite loop under current traffic. NOT "a component might re-render" or "a value might be wrong."
- corruption: User data is silently wrong, lost, or permanently corrupted. Data written to the database is incorrect. NOT "a cache might be stale" or "a UI shows the wrong value temporarily."
- security: An attacker can exploit this TODAY. You can describe the exact HTTP request or input that triggers it.

Pay attention to BOTH additions and deletions. A deletion that removes important validation or error handling is a critical issue.

Do NOT report (automatic disqualifiers):
- Style, naming, minor optimizations, comments, test files
- Architectural suggestions or "better ways" to do something
- Hypothetical issues requiring unusual inputs or unlikely conditions
- Missing error handling where failure would surface as a visible bug (not silent corruption)
- React/frontend best practices: key props, memoization, re-render optimization
- Missing null checks on values from the application's own internal code
- Missing optional chaining on fields guaranteed by TypeScript types or API contracts
- Polling intervals, caching strategies, or client-side storage parsing
- .sqlx cache files, lock files, or generated files

SELF-CHECK: Before including ANY finding, ask yourself:
1. Can I describe the EXACT sequence of normal user actions that triggers this?
2. Would the result be an outage, data loss, or security breach?
3. Would a senior engineer agree this is a production incident, not a code quality nit?
If any answer is NO, do not include it.

${'═'.repeat(60)}
TASK 3: ADVERSARIAL REVIEW
${'═'.repeat(60)}

Review the code from three adversarial perspectives. For each perspective, find the ONE most critical issue. If a perspective finds nothing that would cause a production incident, return no finding for it. Most code is fine. Zero findings per perspective is the expected result.

${personaInstructions}

NEVER report these (automatic disqualifiers for adversarial findings):
- Architectural suggestions ("move X to server", "use pagination", "add caching")
- Frontend best practices (React keys, memoization, polling intervals, re-renders)
- Missing null checks on values from internal code
- Hypothetical issues requiring unlikely conditions
- Code quality, style, naming, or "better ways" to do something

${'═'.repeat(60)}
RESPONSE FORMAT
${'═'.repeat(60)}

IMPORTANT: "line" must be the REAL line number in the new file (computed from @@ hunk headers), NOT the position within the diff output.

Respond in JSON with this exact structure:
{
  "triage": {
    "prSummary": "2-3 sentence summary of what this PR does",
    "themes": ["theme1", "theme2"],
    "highPriorityFiles": ["file1.ts", "file2.rs"],
    "crossSystemImplications": [
      {
        "description": "what cross-system concern exists",
        "filesInvolved": ["file1.ts", "file2.ts"],
        "risk": "high|medium|low"
      }
    ]
  },
  "fileReviews": [
    {
      "filename": "path/to/file",
      "language": "language name",
      "summary": "1-2 sentence summary of changes in this file",
      "critical": [
        {
          "type": "outage|corruption|security",
          "line": 718,
          "issue": "Brief what's wrong (1 sentence)",
          "friendlySuggestion": "Specific, actionable fix (1-2 sentences)"
        }
      ]
    }
  ],
  "adversarialFindings": [
    {
      "persona": "persona name",
      "filename": "path/to/file",
      "type": "outage|corruption|security",
      "line": 718,
      "issue": "What's wrong and WHY it's dangerous (1-2 sentences)",
      "suggestion": "Specific fix (1 sentence)"
    }
  ]
}

Return empty arrays for fileReviews and adversarialFindings if no critical issues found. Most PRs should have zero or very few findings.`;
}

/**
 * Run a single unified review call that combines triage, deep review, and adversarial.
 */
export async function runUnifiedReview(
  client: GoogleGenAI,
  files: DiffFile[],
  architectureContext: string,
  lessonsContext: string,
  config: ReviewPalConfig,
  model: string
): Promise<UnifiedReviewResult> {
  const diffContent = buildFullDiffContent(files);
  const prompt = buildUnifiedPrompt(files, diffContent, architectureContext, lessonsContext, config);

  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      maxOutputTokens: 10000,
    },
  });

  const text = response.text || '';

  let parsed: UnifiedResponse;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Total parse failure: return safe defaults
    return {
      triage: defaultTriageResult(files),
      deepReviews: [],
      adversarialFindings: [],
    };
  }

  // Map triage section
  const triage = mapTriageResult(parsed.triage, files);

  // Map deep review section
  const deepReviews = mapDeepReviews(parsed.fileReviews);

  // Map adversarial section
  const adversarialFindings = mapAdversarialFindings(parsed.adversarialFindings);

  return { triage, deepReviews, adversarialFindings };
}

function mapTriageResult(
  raw: UnifiedResponse['triage'],
  files: DiffFile[]
): TriageResult {
  if (!raw) return defaultTriageResult(files);

  return {
    prSummary: raw.prSummary || 'PR changes',
    themes: Array.isArray(raw.themes) ? raw.themes : [],
    highPriorityFiles: Array.isArray(raw.highPriorityFiles)
      ? raw.highPriorityFiles.filter((f): f is string => typeof f === 'string')
      : files.slice(0, 8).map(f => f.filename),
    crossSystemImplications: Array.isArray(raw.crossSystemImplications)
      ? raw.crossSystemImplications.map(c => ({
          ...c,
          risk: (['high', 'medium', 'low'].includes(c.risk) ? c.risk : 'medium') as 'high' | 'medium' | 'low',
        }))
      : [],
  };
}

function mapDeepReviews(
  raw: UnifiedResponse['fileReviews']
): DeepReviewResult[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(r => r && r.filename)
    .map(r => ({
      filename: r.filename!,
      summary: r.summary || 'Code changes',
      critical: Array.isArray(r.critical) ? r.critical.map(c => ({
        type: (c.type || 'outage') as DeepReviewResult['critical'][number]['type'],
        line: c.line || 1,
        issue: c.issue || '',
        friendlySuggestion: c.friendlySuggestion || c.issue || '',
      })) : [],
      language: r.language || 'Unknown',
    }));
}

function mapAdversarialFindings(
  raw: UnifiedResponse['adversarialFindings']
): AdversarialFinding[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(f => f && f.filename && f.issue)
    .map(f => ({
      persona: f.persona || 'Unknown',
      filename: f.filename!,
      type: (f.type || 'outage') as AdversarialFinding['type'],
      line: f.line || 1,
      issue: f.issue!,
      friendlySuggestion: f.suggestion || f.issue!,
    }));
}

function defaultTriageResult(files: DiffFile[]): TriageResult {
  return {
    prSummary: 'Unable to triage PR',
    themes: [],
    highPriorityFiles: files.slice(0, 8).map(f => f.filename),
    crossSystemImplications: [],
  };
}
