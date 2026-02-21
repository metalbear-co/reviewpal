/**
 * Adversarial review pipeline
 * Runs multiple passes with different skeptical personas to catch
 * subtle issues that a single helpful review pass would miss.
 */

import { GoogleGenAI } from '@google/genai';
import { DiffFile, TriageResult, AdversarialFinding } from '../types.js';
import { ReviewPalConfig } from './context.js';

interface PersonaConfig {
  name: string;
  systemPrompt: string;
  focusTypes: string[];
}

const PERSONAS: PersonaConfig[] = [
  {
    name: 'Security Auditor',
    systemPrompt: `You are a penetration tester reviewing code for exploitable vulnerabilities.
Think like an attacker. For each file, ask: "How would I exploit this?"

Focus on:
- Input that reaches dangerous operations without sanitization
- Authentication/authorization bypasses
- Secrets, tokens, or credentials in code or config
- Injection vectors (SQL, command, template, header)
- Insecure deserialization or eval-like patterns
- SSRF, open redirect, path traversal
- Race conditions that could be exploited
- Missing rate limiting on sensitive endpoints

Do NOT flag theoretical issues. Only flag things with a concrete attack vector.`,
    focusTypes: ['security'],
  },
  {
    name: 'Silent Regression Hunter',
    systemPrompt: `You are hunting for silent regressions: behavioral changes that existing tests might NOT catch.

Focus on:
- Deleted code that previously handled edge cases, validated input, or caught errors
- Changed default values or configuration
- Reordered operations that could affect timing or state
- Modified error handling that now swallows errors silently
- Changed return types or response shapes that callers depend on
- Removed or weakened validation that downstream code relies on
- Database query changes that alter result ordering or filtering
- API contract changes (new required fields, removed fields, changed semantics)

Compare the removed lines (-) with the added lines (+) carefully.
The most dangerous regressions are where the code LOOKS correct but behaves differently in edge cases.`,
    focusTypes: ['regression', 'crash', 'data-loss'],
  },
  {
    name: 'Concurrency & Resource Analyst',
    systemPrompt: `You are an expert in concurrency, resource management, and production reliability.

Focus on:
- Race conditions between concurrent operations
- Missing locks, atomicity violations
- Resource leaks (file handles, connections, memory, subscriptions)
- Unbounded growth (caches, queues, maps that never shrink)
- Missing timeouts on network calls, database queries, or locks
- N+1 query patterns or O(n^2) loops on potentially large datasets
- Missing backpressure or rate limiting
- Error paths that skip cleanup (missing finally/defer/drop)

Only flag issues that would manifest in production under real load, not theoretical concerns.`,
    focusTypes: ['performance', 'crash'],
  },
];

/**
 * Run adversarial review passes on high-priority files.
 * Each persona gets a different adversarial prompt to catch blind spots.
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

  // Budget: split calls across personas
  // Each persona reviews the top files within their share of the budget
  const callsPerPersona = Math.max(1, Math.floor(maxCalls / PERSONAS.length));
  const filesToReview = prioritizedFiles.slice(0, callsPerPersona);

  // Run all personas in parallel
  const allFindings = await Promise.all(
    PERSONAS.map(persona =>
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

Find the ONE most critical issue from your perspective. If you find nothing exploitable or dangerous, return an empty findings array.

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

Return at most 2 findings. Quality over quantity. Only real issues with concrete impact.`;

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
