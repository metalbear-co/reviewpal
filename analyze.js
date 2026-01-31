#!/usr/bin/env node

/**
 * Analyze PR diff using Anthropic API
 * Usage: node analyze.js <diff-file> <pr-number>
 */

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GH_TOKEN = process.env.GH_TOKEN;
const REPO_OWNER = process.env.REPO_OWNER;
const REPO_NAME = process.env.REPO_NAME;

if (!ANTHROPIC_API_KEY) {
  console.error('Error: ANTHROPIC_API_KEY environment variable not set');
  process.exit(1);
}

const diffFile = process.argv[2];
const prNumber = process.argv[3];

if (!diffFile) {
  console.error('Usage: node analyze.js <diff-file> <pr-number>');
  process.exit(1);
}

const diff = fs.readFileSync(diffFile, 'utf-8');

function getPRMetadata() {
  if (!prNumber || !GH_TOKEN) {
    return { title: '', body: '' };
  }

  try {
    const result = execSync(
      `gh pr view ${prNumber} --json title,body`,
      { encoding: 'utf-8', env: { ...process.env, GH_TOKEN } }
    );
    return JSON.parse(result);
  } catch (error) {
    return { title: '', body: '' };
  }
}

const issuesPrompt = `Analyze this code diff for CRITICAL issues only. Ignore style, linting, and obvious code.

ONLY report:
- Security vulnerabilities (SQL injection, XSS, auth bypass, secrets)
- Data loss/corruption risks
- Performance killers (N+1, memory leaks, infinite loops)
- Breaking changes in public APIs

For each issue, provide:
1. Severity: CRITICAL, HIGH, MEDIUM, or LOW
2. Type: Short label (e.g., "SQL Injection", "Memory Leak")
3. Location: file:line
4. Context: ONE line explaining impact (e.g., "public API, 1200 req/day")
5. Fix: Exact code to use (if possible in 1 line)

Format as JSON array:
[
  {
    "severity": "CRITICAL",
    "type": "SQL Injection",
    "file": "api/users.ts",
    "line": 42,
    "context": "public API, user-facing endpoint",
    "fix": "db.query('SELECT * FROM users WHERE id = ?', [userId])"
  }
]

If no critical issues, return: []

Diff:
${diff}`;

function buildIntentPrompt(prMeta) {
  return `Based on this PR title and description, explain what this PR is trying to accomplish in 3 sentences. Write in a conversational, human tone - not robotic or corporate. Be specific and helpful.

PR Title: ${prMeta.title}
PR Description: ${prMeta.body || 'No description provided'}

Code changes:
${diff.split('\n').slice(0, 50).join('\n')}

Respond with ONLY 3 sentences explaining the intent. No preamble, no labels, just the sentences.`;
}

function callAnthropic(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'claude-opus-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const options = {
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response);
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

async function main() {
  try {
    const prMeta = getPRMetadata();
    
    // Analyze issues
    const issuesResponse = await callAnthropic(issuesPrompt);
    const issuesContent = issuesResponse.content[0].text;
    const jsonMatch = issuesContent.match(/\[[\s\S]*\]/);
    const issues = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    
    // Generate intent summary
    const intentPrompt = buildIntentPrompt(prMeta);
    const intentResponse = await callAnthropic(intentPrompt);
    const intent = intentResponse.content[0].text.trim();
    
    // Output combined result
    console.log(JSON.stringify({ intent, issues }, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
