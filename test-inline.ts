/**
 * Manual test script for inline analysis
 * 
 * Usage: GITHUB_TOKEN=xxx ANTHROPIC_API_KEY=xxx npx tsx test-inline.ts
 */

import { GitHubClient } from './src/github.js';
import { ClaudeClient } from './src/anthropic.js';
import { analyzeInline, formatIndexComment, getEmojiForSeverity } from './src/analyzer.js';

async function test() {
  const githubToken = process.env.GITHUB_TOKEN;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!githubToken || !anthropicKey) {
    console.error('Missing GITHUB_TOKEN or ANTHROPIC_API_KEY');
    process.exit(1);
  }

  const github = new GitHubClient(githubToken, 'Arephan', 'ai-pr-helper-test');
  const claude = new ClaudeClient(anthropicKey, 'claude-sonnet-4-20250514');

  console.log('Fetching PR #1...');
  const pr = await github.getPullRequest(1);
  
  console.log(`\nPR: ${pr.title}`);
  console.log(`Files: ${pr.files.length}`);
  console.log(`Changes: +${pr.additions}/-${pr.deletions}`);

  console.log('\n=== Files with patches ===');
  pr.files.forEach((f) => {
    if (f.patch) {
      console.log(`${f.filename}: +${f.additions}/-${f.deletions}`);
    }
  });

  console.log('\n=== Running inline analysis ===');
  const analysis = await analyzeInline(pr, claude);

  console.log(`\nGenerated ${analysis.comments.length} comments`);
  console.log(`Estimated read time: ${analysis.estimatedReadTimeMinutes} min\n`);

  console.log('=== Comments ===');
  analysis.comments.forEach((comment, i) => {
    const emoji = getEmojiForSeverity(comment.severity);
    console.log(`\n${i + 1}. ${emoji} [${comment.severity}] ${comment.file}:${comment.line}`);
    console.log(`   Title: ${comment.title}`);
    console.log(`   Body preview: ${comment.body.split('\n')[0]}...`);
  });

  console.log('\n=== Index Comment ===');
  const commentLinks = analysis.comments.map((c) => ({
    path: c.file,
    line: c.line,
    title: c.title,
    severity: c.severity,
  }));

  const index = formatIndexComment(analysis, commentLinks);
  console.log(index);

  console.log('\n✓ Test complete!');
}

test().catch(console.error);
