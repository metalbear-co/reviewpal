"use strict";
/**
 * Google Gemini API wrapper for AI code review
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGeminiClient = createGeminiClient;
exports.reviewCode = reviewCode;
exports.replyToComment = replyToComment;
const genai_1 = require("@google/genai");
const DEFAULT_MODEL = 'gemini-2.5-pro';
/**
 * Create a Gemini client
 */
function createGeminiClient(apiKey) {
    const key = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) {
        throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY environment variable required');
    }
    return new genai_1.GoogleGenAI({ apiKey: key });
}
/**
 * Review code with AI (language agnostic)
 * Accepts full unified diff (with +/- prefixes)
 */
async function reviewCode(client, code, filename, model = DEFAULT_MODEL, architectureContext) {
    let contextSection = '';
    if (architectureContext) {
        contextSection = `\nPROJECT CONTEXT:\n${architectureContext}\n\nUse this context to understand the codebase architecture when reviewing.\n`;
    }
    const prompt = `You're a code reviewer. Analyze this unified diff in any programming language and provide suggestions.

The diff uses standard unified diff format:
- Lines starting with "+" are additions (new code)
- Lines starting with "-" are deletions (removed code)
- Lines starting with " " (space) are context (unchanged code)
- Line numbers in the diff refer to the NEW file
${contextSection}
DIFF (${filename}):
\`\`\`diff
${code.slice(0, 8000)}
\`\`\`

STEP 1: Determine if this is a test file, test utility, CI/CD config, build config, or dev tooling.
Look at both the filename AND the code contents. Examples include (in any language):
- Test files (e.g. *_test.go, *_spec.rb, test_*.py, *.test.ts, *Test.java, #[cfg(test)], etc.)
- Test fixtures, helpers, mocks, factories
- CI/CD configs (.github/, Jenkinsfile, .gitlab-ci.yml, etc.)
- Build/lint/format configs (Makefile, Dockerfile, *.config.*, tsconfig, Cargo.toml, etc.)

If it IS a test or config file, set "isTestOrConfig" to true and return an EMPTY critical array.
Only exception: flag leaked secrets (API keys, passwords) even in test files.

STEP 2: For production code only, report CRITICAL issues:
- Security vulnerabilities (exposed secrets, SQL injection, XSS)
- Will crash in production (unhandled errors, null refs, race conditions)
- Data loss risks (missing validation, destructive ops)
- Major performance problems (N+1 queries, infinite loops, memory leaks)

Pay attention to BOTH additions and deletions. A deletion that removes important validation or error handling is a critical issue too.

Ignore: style, minor optimizations, naming, comments, anything non-critical.
Do NOT suggest adding try-catch or null checks where a failure would correctly surface a real bug.

Respond in JSON:
{
  "language": "language name",
  "isTestOrConfig": true_or_false,
  "summary": "Factual summary of what this code does. Use short, declarative sentences. Do NOT mention risk level. Be neutral and technical. 2-4 sentences.",
  "critical": [
    {
      "type": "security|crash|data-loss|performance",
      "line": line_number_where_issue_is,
      "issue": "Brief what's wrong (1 sentence)",
      "friendlySuggestion": "A helpful suggestion for how to improve or fix it. Be specific and actionable. 1-2 sentences max."
    }
  ]
}

If no CRITICAL issues, return empty critical array.`;
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
            return defaultReview();
        }
        const parsed = JSON.parse(jsonMatch[0]);
        const isTestOrConfig = parsed.isTestOrConfig === true;
        return {
            language: parsed.language || 'Unknown',
            summary: parsed.summary || 'Code changes',
            critical: isTestOrConfig ? [] : (Array.isArray(parsed.critical) ? parsed.critical : [])
        };
    }
    catch (e) {
        console.error('Failed to parse AI response:', e);
        return defaultReview();
    }
}
function defaultReview() {
    return {
        language: 'Unknown',
        summary: 'Unable to analyze',
        critical: []
    };
}
/**
 * Reply to a user's question about a code review comment
 */
async function replyToComment(client, question, originalComment, codeContext, model = DEFAULT_MODEL) {
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
    const response = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
            maxOutputTokens: 1000,
        },
    });
    return response.text || 'I apologize, but I was unable to generate a response. Please try rephrasing your question.';
}
//# sourceMappingURL=gemini.js.map