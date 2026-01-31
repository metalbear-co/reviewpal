/**
 * Intent Analyzer - Analyzes PR changes and generates inline diff comments
 * 
 * Feature 2: Smart PR Breakdown (Opus-Powered)
 */

import type { PRData, PRFile, IntentGroup, PRSummary, InlineAnalysis, InlineComment, Severity } from './types.js';
import { ClaudeClient } from './anthropic.js';

/**
 * Get emoji for severity
 */
export function getEmojiForSeverity(severity: Severity): string {
  const emojiMap: Record<Severity, string> = {
    explanation: '📖',
    warning: '⚠️',
    bug: '🐛',
    security: '🔒',
    suggestion: '🎨',
  };
  return emojiMap[severity];
}

/**
 * Format inline comment body
 */
function formatInlineCommentBody(comment: InlineComment): string {
  const emoji = getEmojiForSeverity(comment.severity);
  return comment.body.trim();
}

/**
 * Parse diff to extract line numbers for added/modified lines
 */
function parseDiffLineNumbers(patch: string): number[] {
  const lines: number[] = [];
  const hunkHeaderRegex = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
  
  let currentLine = 0;
  const patchLines = patch.split('\n');
  
  for (const line of patchLines) {
    const match = line.match(hunkHeaderRegex);
    if (match) {
      currentLine = parseInt(match[1], 10);
      continue;
    }
    
    if (line.startsWith('+') && !line.startsWith('+++')) {
      lines.push(currentLine);
      currentLine++;
    } else if (!line.startsWith('-')) {
      currentLine++;
    }
  }
  
  return lines;
}

/**
 * Analyze PR and generate inline comments using Claude
 */
export async function analyzeInline(pr: PRData, claude: ClaudeClient): Promise<InlineAnalysis> {
  const systemPrompt = `You are a senior code reviewer analyzing a pull request.

Your job is to:
1. Review each diff hunk carefully
2. Identify specific lines that need reviewer attention
3. Categorize issues by severity
4. Provide clear, actionable feedback

Severity levels:
- 📖 **explanation** - Context/what this does (informational)
- ⚠️ **warning** - Needs review, potential issue
- 🐛 **bug** - Logic error, edge case
- 🔒 **security** - Auth, XSS, injection risks
- 🎨 **suggestion** - Optional improvement

Focus on:
- Security vulnerabilities (auth bypass, XSS, SQL injection, secrets)
- Logic errors and edge cases
- Missing error handling
- Performance issues
- Important context that helps reviewers understand the change

Skip:
- Style/formatting (unless it affects readability)
- Obvious changes
- Minor nitpicks`;

  const fileList = pr.files
    .map((f) => `- ${f.filename} (+${f.additions}/-${f.deletions}): ${f.status}`)
    .join('\n');

  const patches = pr.files
    .filter((f) => f.patch)
    .map((f) => {
      const lineNumbers = parseDiffLineNumbers(f.patch!);
      return `### ${f.filename}
Available lines for comments: ${lineNumbers.join(', ')}

\`\`\`diff
${f.patch}
\`\`\``;
    })
    .join('\n\n');

  const userPrompt = `# PR #${pr.number}: ${pr.title}

## PR Description
${pr.body ?? 'No description provided'}

## Files Changed (${pr.files.length} files, +${pr.additions}/-${pr.deletions})
${fileList}

## Full Diff
${patches.slice(0, 30000)}

---

Analyze this PR and generate inline comments for specific lines that need attention.

For each comment, provide:
1. **file** - The filename
2. **line** - The line number (must be from the "Available lines" list above)
3. **title** - Short title (max 50 chars)
4. **severity** - One of: explanation, warning, bug, security, suggestion
5. **what** - Brief description of what this code does
6. **why** - Why this needs attention
7. **action** - What the reviewer should do

Return JSON in this format:
{
  "comments": [
    {
      "file": ".github/workflows/ci.yml",
      "line": 12,
      "title": "Workflow permissions",
      "severity": "explanation",
      "what": "Sets workflow permissions to read-only by default",
      "why": "This is a security best practice to limit token scope",
      "action": "Verify this doesn't break any deployment steps"
    },
    {
      "file": "src/api/auth.ts",
      "line": 45,
      "title": "Missing input validation",
      "severity": "bug",
      "what": "User input from request body is used directly",
      "why": "Could allow injection attacks or unexpected data types",
      "action": "Add schema validation (zod/joi) before using user input"
    }
  ],
  "estimatedReadTimeMinutes": 8
}

Guidelines:
- Aim for 5-15 comments total (focus on what matters most)
- Line numbers MUST be from the "Available lines" lists
- Be specific and actionable
- Prioritize security > bugs > warnings > suggestions > explanations`;

  const response = await claude.completeJSON<{
    comments: Array<{
      file: string;
      line: number;
      title: string;
      severity: Severity;
      what: string;
      why: string;
      action: string;
    }>;
    estimatedReadTimeMinutes: number;
  }>(systemPrompt, userPrompt, { maxTokens: 4096 });

  // Format comments
  const comments: InlineComment[] = response.comments.map((c) => ({
    file: c.file,
    line: c.line,
    title: c.title,
    severity: c.severity,
    body: `${getEmojiForSeverity(c.severity)} **${c.title}**

**What:** ${c.what}
**Why:** ${c.why}
**Action:** ${c.action}`,
  }));

  return {
    comments,
    estimatedReadTimeMinutes: response.estimatedReadTimeMinutes,
  };
}

/**
 * Analyze PR and group changes by intent using Claude (legacy format)
 */
export async function analyzePR(pr: PRData, claude: ClaudeClient): Promise<PRSummary> {
  const systemPrompt = `You are a senior code reviewer creating a navigable summary of a PR.

Your job is to:
1. Group changes by INTENT (what they accomplish, not file type)
2. Create clear, scannable summaries
3. Highlight things reviewers should watch out for
4. Generate helpful diagrams when appropriate

Each group should be independently understandable and help the reviewer navigate the PR.`;

  const fileList = pr.files
    .map((f) => `- ${f.filename} (+${f.additions}/-${f.deletions}): ${f.status}`)
    .join('\n');

  const patches = pr.files
    .filter((f) => f.patch)
    .map((f) => `### ${f.filename}\n\`\`\`diff\n${f.patch}\n\`\`\``)
    .join('\n\n');

  const userPrompt = `# PR #${pr.number}: ${pr.title}

## PR Description
${pr.body ?? 'No description provided'}

## Files Changed (${pr.files.length} files, +${pr.additions}/-${pr.deletions})
${fileList}

## Full Diff
${patches.slice(0, 30000)}

---

Analyze this PR and group changes by their INTENT (not by file type).

For each group:
1. Give it an ID (lowercase-hyphenated, like "auth-flow")
2. Name it clearly
3. Write a one-sentence summary (what it does)
4. Explain WHY this change is needed
5. List the files involved
6. Identify things to watch out for during review
7. If helpful, include an ASCII diagram showing the flow

Return JSON in this format:
{
  "groups": [
    {
      "id": "auth-flow",
      "name": "Authentication Flow",
      "summary": "Adds OAuth login with Google",
      "reason": "Replace deprecated session-based auth",
      "files": ["auth.ts", "login.tsx", "api/oauth.ts"],
      "lineRange": { "start": 1, "end": 155 },
      "details": "Detailed explanation of what this code does...",
      "watchOutFor": [
        "Token refresh happens in background (useEffect line 78)",
        "Logout clears both cookie AND localStorage"
      ],
      "diagram": "User clicks Login\\n  ↓\\nOAuth redirect\\n  ↓\\nCallback + token\\n  ↓\\nStore cookie ✓"
    }
  ],
  "estimatedReadTimeMinutes": 8
}

Guidelines:
- Aim for 2-5 groups (don't over-fragment)
- If a group would be >200 lines, consider splitting it
- Make summaries actionable ("Adds X" not "Changes to X")
- Watch-outs should be specific, not generic`;

  const response = await claude.completeJSON<{
    groups: IntentGroup[];
    estimatedReadTimeMinutes: number;
  }>(systemPrompt, userPrompt, { maxTokens: 4096 });

  return {
    totalChanges: response.groups.length,
    estimatedReadTimeMinutes: response.estimatedReadTimeMinutes,
    groups: response.groups,
  };
}

/**
 * Format index comment with navigation links to inline comments
 */
export function formatIndexComment(
  analysis: InlineAnalysis,
  commentLinks: Array<{ path: string; line: number; title: string; severity: Severity }>
): string {
  const header = `## 📋 Quick Navigation

Found ${commentLinks.length} items for review (~${analysis.estimatedReadTimeMinutes} min read)

`;

  // Group by severity for better organization
  const groups: Record<Severity, typeof commentLinks> = {
    security: [],
    bug: [],
    warning: [],
    suggestion: [],
    explanation: [],
  };

  commentLinks.forEach((link) => {
    groups[link.severity].push(link);
  });

  let navigation = '';
  let index = 1;

  // Order by priority
  const severities: Severity[] = ['security', 'bug', 'warning', 'suggestion', 'explanation'];
  
  for (const severity of severities) {
    const items = groups[severity];
    if (items.length === 0) continue;

    const emoji = getEmojiForSeverity(severity);
    navigation += `### ${emoji} ${severity.charAt(0).toUpperCase() + severity.slice(1)}\n\n`;

    for (const item of items) {
      // GitHub doesn't support direct linking to review comments from issues,
      // but we can at least show the location
      navigation += `${index}. **${item.title}** → \`${item.path}:${item.line}\`\n`;
      index++;
    }
    navigation += '\n';
  }

  const footer = `---

<sub>🦞 AI PR Helper v2 | Inline Review Mode | Powered by Claude</sub>`;

  return header + navigation + footer;
}

/**
 * Format PR summary as a GitHub comment with clickable navigation
 */
export function formatSummaryComment(summary: PRSummary, prNumber: number): string {
  const header = `## 📋 PR Summary (${summary.totalChanges} changes, ~${summary.estimatedReadTimeMinutes} min)

`;

  // Navigation index
  let index = '### Quick Navigation\n\n';
  summary.groups.forEach((group, i) => {
    const lineInfo = group.lineRange
      ? ` (lines ${group.lineRange.start}-${group.lineRange.end})`
      : '';
    index += `${i + 1}. [**${group.name}**](#${group.id})${lineInfo}\n`;
    index += `   - ${group.summary}\n`;
    index += `   - Files: ${group.files.map((f) => `\`${f}\``).join(', ')}\n\n`;
  });

  // Detailed sections
  let details = '\n---\n\n### Details\n\n';
  summary.groups.forEach((group) => {
    details += `<details id="${group.id}">
<summary><strong>${getEmojiForGroup(group.name)} ${group.name}</strong></summary>

#### What
${group.summary}

#### Why
${group.reason}

#### Files
${group.files.map((f) => `- \`${f}\``).join('\n')}

#### Explanation
${group.details}

${group.diagram ? `#### Flow
\`\`\`
${group.diagram}
\`\`\`
` : ''}
${group.watchOutFor.length > 0 ? `#### ⚠️ Watch out for
${group.watchOutFor.map((w) => `- ${w}`).join('\n')}
` : ''}
</details>

`;
  });

  const footer = `
---

<sub>🦞 AI PR Helper | [What does this do?](#help) | Powered by Claude</sub>`;

  return header + index + details + footer;
}

/**
 * Get an emoji based on group name (heuristic)
 */
function getEmojiForGroup(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('auth')) return '🔐';
  if (lower.includes('api') || lower.includes('endpoint')) return '🔌';
  if (lower.includes('ui') || lower.includes('component')) return '🎨';
  if (lower.includes('test')) return '🧪';
  if (lower.includes('config') || lower.includes('setup')) return '⚙️';
  if (lower.includes('error') || lower.includes('handling')) return '🛡️';
  if (lower.includes('cache') || lower.includes('performance')) return '⚡';
  if (lower.includes('database') || lower.includes('db')) return '🗄️';
  if (lower.includes('log')) return '📝';
  if (lower.includes('security')) return '🔒';
  if (lower.includes('refactor')) return '♻️';
  if (lower.includes('fix') || lower.includes('bug')) return '🐛';
  if (lower.includes('feature')) return '✨';
  if (lower.includes('docs')) return '📚';
  return '📦';
}
