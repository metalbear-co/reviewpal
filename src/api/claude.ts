/**
 * Claude API wrapper for AI code review
 */

import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export interface AIReview {
  summary: string;      // 1 sentence: what is this PR
  critical: Array<{
    type: 'security' | 'crash' | 'data-loss' | 'performance';
    line: number;
    issue: string;      // Brief description
    friendlySuggestion: string;  // Polite, helpful suggestion for inline comment
  }>;
  language: string;
}

/**
 * Initialize Claude client
 */
export function initClaudeClient(apiKey?: string): void {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }
  client = new Anthropic({ apiKey: key });
}

/**
 * Get Claude client (throws if not initialized)
 */
function getClient(): Anthropic {
  if (!client) {
    throw new Error('Claude client not initialized. Call initClaudeClient first.');
  }
  return client;
}

/**
 * Review code with AI (language agnostic)
 */
export async function reviewCode(
  code: string,
  filename: string,
  model: string = 'claude-sonnet-4-20250514'
): Promise<AIReview> {
  const prompt = `You're a code reviewer. Analyze this code in any programming language and provide suggestions.

CODE (${filename}):
\`\`\`
${code.slice(0, 4000)}
\`\`\`

Detect the language automatically. ONLY report CRITICAL issues that could break production:
- 🔒 Security vulnerabilities (exposed secrets, SQL injection, XSS)
- 💥 Will crash (unhandled errors, null refs, race conditions)
- 🗑️ Data loss risks (missing validation, destructive ops)
- 🐌 Major performance problems (N+1 queries, infinite loops, memory leaks)

Ignore: style, minor optimizations, naming, comments, anything non-critical.

Respond in JSON:
{
  "language": "language name",
  "summary": "Factual summary of what this PR does. Use short, declarative sentences. State what it adds, what it changes, and what functionality it provides. Do NOT mention risk level. Be neutral and technical. 2-4 sentences.",
  "critical": [
    {
      "type": "security|crash|data-loss|performance",
      "line": line_number_where_issue_is,
      "issue": "Brief what's wrong (1 sentence)",
      "friendlySuggestion": "A helpful suggestion for how to improve or fix it. Be specific and actionable. 1-2 sentences max."
    }
  ]
}

Be encouraging and helpful in your summary. If no CRITICAL issues, return empty critical array.`;

  const response = await getClient().messages.create({
    model,
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return defaultReview();
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      language: parsed.language || 'Unknown',
      summary: parsed.summary || 'Code changes',
      critical: Array.isArray(parsed.critical) ? parsed.critical : []
    };
  } catch (e) {
    console.error('Failed to parse AI response:', e);
    return defaultReview();
  }
}

function defaultReview(): AIReview {
  return {
    language: 'Unknown',
    summary: 'Unable to analyze',
    critical: []
  };
}

/**
 * Reply to a user's question about a code review comment
 */
export async function replyToComment(
  question: string,
  originalComment: string,
  codeContext: string,
  model: string = 'claude-sonnet-4-20250514'
): Promise<string> {
  const prompt = `You are ReviewPal, an AI code review assistant. A user is asking a follow-up question about your previous code review comment.

YOUR ORIGINAL COMMENT:
${originalComment}

CODE CONTEXT:
\`\`\`
${codeContext.slice(0, 3000)}
\`\`\`

USER'S QUESTION:
${question}

Provide a helpful, concise response to their question. Be friendly and educational. If they're asking for clarification, explain in more detail. If they're disagreeing, consider their point fairly. If they're asking how to fix something, provide a specific code example if appropriate.

Keep your response under 500 words. Use markdown formatting for code snippets.`;

  const response = await getClient().messages.create({
    model,
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return text || 'I apologize, but I was unable to generate a response. Please try rephrasing your question.';
}
