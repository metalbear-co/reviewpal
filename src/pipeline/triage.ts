/**
 * Triage pipeline: Phase A
 * One Gemini call to summarize all changes and identify high-priority files
 */

import { GoogleGenAI } from '@google/genai';
import { DiffFile, TriageResult } from '../types.js';
import { ReviewPalConfig } from './context.js';

/**
 * Build a condensed summary of all changed files for the triage call.
 * Includes filename, +/- stats, and first few lines of each hunk.
 */
export function buildTriageSummary(files: DiffFile[]): string {
  const parts: string[] = [];

  for (const file of files) {
    parts.push(`### ${file.filename} (+${file.additions}/-${file.deletions})`);
    for (const hunk of file.hunks) {
      const allLines = hunk.content.split('\n');
      if (allLines.length <= 20) {
        // Small hunk: show everything
        parts.push(allLines.join('\n'));
      } else if (allLines.length <= 40) {
        // Medium hunk: show first 20 lines
        parts.push(allLines.slice(0, 20).join('\n'));
        parts.push(`  ... (${allLines.length - 20} more lines)`);
      } else {
        // Large hunk: show first 15 + last 5 to capture beginning and end
        parts.push(allLines.slice(0, 15).join('\n'));
        parts.push(`  ... (${allLines.length - 20} more lines)`);
        parts.push(allLines.slice(-5).join('\n'));
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
export async function triagePR(
  client: GoogleGenAI,
  files: DiffFile[],
  architectureContext: string,
  config: ReviewPalConfig,
  model: string
): Promise<TriageResult> {
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
${summary.slice(0, 20000)}

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
      maxOutputTokens: 4000,
    },
  });

  const text = response.text || '';

  try {
    const parsed = JSON.parse(text);
    return {
      prSummary: parsed.prSummary || 'PR changes',
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      highPriorityFiles: Array.isArray(parsed.highPriorityFiles)
        ? parsed.highPriorityFiles.filter((f: unknown) => typeof f === 'string')
        : files.slice(0, 8).map(f => f.filename),
      crossSystemImplications: Array.isArray(parsed.crossSystemImplications)
        ? parsed.crossSystemImplications
        : [],
    };
  } catch {
    return defaultTriageResult(files);
  }
}

function defaultTriageResult(files: DiffFile[]): TriageResult {
  return {
    prSummary: 'Unable to triage PR',
    themes: [],
    highPriorityFiles: files.slice(0, 8).map(f => f.filename),
    crossSystemImplications: [],
  };
}
