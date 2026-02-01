/**
 * Claude API wrapper for AI code review
 */

import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export interface AIReview {
  explanation: string;  // Human-friendly explanation of what this PR does
  concerns: string[];   // List of specific concerns, written naturally
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
  const prompt = `You're a friendly senior developer doing a code review. A teammate just opened a PR with this code change in ${filename}.

Review it like you're talking to them in person - casual, helpful, specific.

CODE:
\`\`\`
${code.slice(0, 4000)}
\`\`\`

Write a review that:
1. Explains what this code does (like you're telling a friend)
2. Points out specific issues you notice (be direct but nice)
3. For each issue, say WHERE it is and HOW to fix it

Respond in JSON:
{
  "language": "programming language",
  "explanation": "2-3 sentences explaining what this PR does, written conversationally",
  "concerns": [
    "Natural sentence pointing out an issue, like: 'Hey, on line 23 you're calling fetch without error handling - if the network fails this will crash. Wrap it in try-catch or add .catch()'",
    "Another concern in natural language..."
  ]
}

Only mention real issues. If the code is solid, make concerns an empty array and say so in explanation.
Be specific about line numbers/locations when you can see them.
Write like a human, not a report.`;

  const response = await getClient().messages.create({
    model,
    max_tokens: 1500,
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
      explanation: parsed.explanation || 'Code changes detected',
      concerns: Array.isArray(parsed.concerns) ? parsed.concerns : []
    };
  } catch (e) {
    console.error('Failed to parse AI response:', e);
    return defaultReview();
  }
}

function defaultReview(): AIReview {
  return {
    language: 'Unknown',
    explanation: 'Unable to analyze code - might be a parsing issue.',
    concerns: []
  };
}
