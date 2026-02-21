/**
 * Adversarial review pipeline
 * Runs multiple passes with different skeptical personas to catch
 * subtle issues that a single helpful review pass would miss.
 * Personas adapt based on the primary language(s) in the PR.
 *
 * NOTE: This module is no longer called from index.ts (unified-review.ts
 * handles adversarial review inline). Kept for backward compatibility.
 */

import { GoogleGenAI } from '@google/genai';
import { DiffFile, TriageResult, AdversarialFinding } from '../types.js';
import { ReviewPalConfig } from './context.js';
import { selectPersonas, PersonaConfig } from './personas.js';

/**
 * Run adversarial review passes on high-priority files.
 * Each persona gets a different adversarial prompt to catch blind spots.
 * The third persona adapts based on the primary language in the PR.
 */
export async function runAdversarialReview(
  client: GoogleGenAI,
  files: DiffFile[],
  triageResult: TriageResult,
  architectureContext: string,
  lessonsContext: string,
  config: ReviewPalConfig,
  model: string,
  maxCalls: number
): Promise<AdversarialFinding[]> {
  // Pick files to review: use triage priorities, fall back to largest files
  const prioritizedFiles: DiffFile[] = [];
  for (const filename of triageResult.highPriorityFiles) {
    const file = files.find(f => f.filename === filename);
    if (file) prioritizedFiles.push(file);
  }
  if (prioritizedFiles.length === 0) {
    prioritizedFiles.push(
      ...files
        .sort((a, b) => (b.additions + b.deletions) - (a.additions + a.deletions))
        .slice(0, 3)
    );
  }

  // Select personas based on PR language
  const personas = selectPersonas(files);

  // Budget: split calls across personas
  const callsPerPersona = Math.max(1, Math.floor(maxCalls / personas.length));
  const filesToReview = prioritizedFiles.slice(0, callsPerPersona);

  // Run all personas in parallel
  const allFindings = await Promise.all(
    personas.map(persona =>
      reviewWithPersona(client, persona, filesToReview, triageResult, architectureContext, lessonsContext, config, model)
    )
  );

  // Flatten and deduplicate findings
  const findings = allFindings.flat();
  return deduplicateFindings(findings);
}

async function reviewWithPersona(
  client: GoogleGenAI,
  persona: PersonaConfig,
  files: DiffFile[],
  triageResult: TriageResult,
  architectureContext: string,
  lessonsContext: string,
  config: ReviewPalConfig,
  model: string
): Promise<AdversarialFinding[]> {
  // Combine all file diffs into one prompt for efficiency
  const fileDiffs = files.map(file => {
    const fullDiff = file.hunks.map(h => h.content).join('\n...\n');
    return `### ${file.filename} (+${file.additions}/-${file.deletions})\n\`\`\`diff\n${fullDiff.slice(0, 5000)}\n\`\`\``;
  }).join('\n\n');

  let contextSection = '';
  if (architectureContext) {
    contextSection = `\nPROJECT CONTEXT:\n${architectureContext}\n`;
  }

  let lessonsSection = '';
  if (lessonsContext) {
    lessonsSection = `\nPAST LESSONS (from .reviewpal-lessons.md - do NOT repeat these false positives):\n${lessonsContext}\n`;
  }

  const prompt = `${persona.systemPrompt}
${contextSection}${lessonsSection}
PR SUMMARY: ${triageResult.prSummary}

CODE TO REVIEW:
${fileDiffs.slice(0, 15000)}

Find the ONE most critical issue from your perspective. If you find nothing that would cause a production incident, return an EMPTY findings array. It is completely fine and expected to return zero findings. Most code is fine. An empty array is the correct answer for most PRs.

NEVER report these (automatic disqualifiers):
- Architectural suggestions ("move X to server", "use pagination", "add caching")
- Frontend best practices (React keys, memoization, polling intervals, re-renders)
- Missing null checks on values from the application's own internal code
- Client-side storage parsing (localStorage, sessionStorage)
- Hypothetical issues requiring unlikely inputs or unusual conditions
- Code quality, style, naming, or "better ways" to do something

SELF-CHECK before reporting: Can you describe the EXACT user actions that trigger a production outage, data loss, or security breach? If not, return empty findings.

Respond in JSON:
{
  "findings": [
    {
      "filename": "path/to/file",
      "type": "${persona.focusTypes.join('|')}",
      "line": line_number,
      "issue": "What's wrong and WHY it's dangerous (1-2 sentences)",
      "suggestion": "Specific fix (1 sentence)"
    }
  ]
}

Return at most 1 finding. Only report something you are highly confident would cause a real production incident.`;

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
    const findings: AdversarialFinding[] = [];
    if (Array.isArray(parsed.findings)) {
      for (const f of parsed.findings) {
        if (f.filename && f.issue) {
          findings.push({
            persona: persona.name,
            filename: f.filename,
            type: f.type || persona.focusTypes[0] || 'security',
            line: f.line || 1,
            issue: f.issue,
            friendlySuggestion: f.suggestion || f.issue,
          });
        }
      }
    }
    return findings;
  } catch {
    return [];
  }
}

/**
 * Deduplicate findings that point to the same file+line with similar issues.
 */
function deduplicateFindings(findings: AdversarialFinding[]): AdversarialFinding[] {
  const seen = new Set<string>();
  const unique: AdversarialFinding[] = [];

  for (const f of findings) {
    const key = `${f.filename}:${f.line}:${f.type}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(f);
    }
  }

  return unique;
}
