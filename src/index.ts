/**
 * AI PR Helper - Main Entry Point
 * 
 * Handles GitHub Action events and routes to appropriate handlers
 */

import * as core from '@actions/core';
import type { Config, PRSummary } from './types.js';
import { GitHubClient, parseActionContext } from './github.js';
import { ClaudeClient } from './anthropic.js';
import { estimateSize, suggestSplits, formatSizeComment } from './estimator.js';
import { analyzePR, formatSummaryComment, analyzeInline, formatIndexComment } from './analyzer.js';
import { processComment } from './responder.js';
import { addSizeLabel } from './labels.js';

// Bot identifier for finding/updating our comments
const BOT_IDENTIFIER_SIZE = 'ai-pr-helper:size-check';
const BOT_IDENTIFIER_SUMMARY = 'ai-pr-helper:pr-summary';
const BOT_IDENTIFIER_INDEX = 'ai-pr-helper:inline-index';
const BOT_USERNAME = 'github-actions[bot]';

/**
 * Load configuration from action inputs
 */
function loadConfig(): Config {
  return {
    anthropicApiKey: core.getInput('anthropic-api-key', { required: true }),
    githubToken: core.getInput('github-token', { required: true }),
    mode: core.getInput('mode') as Config['mode'] || 'auto',
    maxLines: parseInt(core.getInput('max-lines') || '500', 10),
    maxReadTimeMinutes: parseInt(core.getInput('max-read-time') || '10', 10),
    model: core.getInput('model') || 'claude-sonnet-4-20250514',
  };
}

/**
 * Handle PR opened or updated in draft state
 */
async function handleDraftPR(
  github: GitHubClient,
  claude: ClaudeClient,
  prNumber: number,
  config: Config
): Promise<void> {
  core.info(`Analyzing draft PR #${prNumber}...`);

  const pr = await github.getPullRequest(prNumber);

  // Skip if not a draft
  if (!pr.draft) {
    core.info('PR is not a draft, skipping size check');
    return;
  }

  // Estimate size
  const estimate = estimateSize(pr, config);
  core.info(`Size estimate: ${estimate.totalLines} lines, ~${estimate.estimatedReadTimeMinutes} min read`);

  // Add size label
  await addSizeLabel(github, prNumber, estimate.totalLines);

  // If too large, suggest splits
  let splits = null;
  if (estimate.isTooLarge) {
    core.info('PR is too large, generating split suggestions...');
    splits = await suggestSplits(pr, estimate, claude);
    core.info(`Generated ${splits.length} split suggestions`);
  }

  // Post or update comment
  const comment = formatSizeComment(estimate, splits, prNumber);
  await github.upsertBotComment(prNumber, BOT_IDENTIFIER_SIZE, comment);

  core.info('Size check complete');
}

/**
 * Handle PR marked ready for review
 */
async function handleReadyPR(
  github: GitHubClient,
  claude: ClaudeClient,
  prNumber: number,
  config: Config
): Promise<void> {
  core.info(`Analyzing ready PR #${prNumber}...`);

  const pr = await github.getPullRequest(prNumber);

  // Estimate size first
  const estimate = estimateSize(pr, config);

  // Add size label
  await addSizeLabel(github, prNumber, estimate.totalLines);

  // If still too large, post a warning
  if (estimate.isTooLarge && estimate.recommendation === 'split-required') {
    const splits = await suggestSplits(pr, estimate, claude);
    const comment = formatSizeComment(estimate, splits, prNumber);
    await github.upsertBotComment(prNumber, BOT_IDENTIFIER_SIZE, comment);
    core.warning(`PR #${prNumber} is ${estimate.totalLines} lines - recommended to split`);
  }

  // Generate inline analysis
  core.info('Generating inline review comments...');
  const analysis = await analyzeInline(pr, claude);
  core.info(`Generated ${analysis.comments.length} inline comments`);

  // Filter out explanations - only post actionable comments inline
  const actionableComments = analysis.comments.filter(
    (c) => c.severity !== 'explanation'
  );
  core.info(`Posting ${actionableComments.length} actionable comments (skipping explanations)`);

  // Get HEAD commit SHA for posting review comments
  const headSha = await github.getPRHeadSha(prNumber);

  // Post inline comments
  const commentResults = await github.postReviewComments(
    prNumber,
    headSha,
    actionableComments.map((c) => ({
      path: c.file,
      line: c.line,
      body: c.body,
    }))
  );

  core.info(`Posted ${commentResults.length} review comments`);

  // Create index comment with navigation (include all comments, even ones not posted inline)
  const commentLinks = analysis.comments.map((c) => ({
    path: c.file,
    line: c.line,
    title: c.title,
    severity: c.severity,
    body: c.body,
  }));

  const indexComment = formatIndexComment(analysis, commentLinks);
  await github.upsertBotComment(prNumber, BOT_IDENTIFIER_INDEX, indexComment);

  // Store analysis for interactive responses (in a real implementation, 
  // this would be stored in a persistent way)
  core.setOutput('analysis', JSON.stringify(analysis));

  core.info('Ready PR analysis complete');
}

/**
 * Handle PR comment for interactive help
 */
async function handleComment(
  github: GitHubClient,
  claude: ClaudeClient,
  prNumber: number,
  commentId: number,
  _config: Config
): Promise<void> {
  core.info(`Handling comment ${commentId} on PR #${prNumber}...`);

  const pr = await github.getPullRequest(prNumber);
  const commentContext = await github.getCommentContext(commentId, prNumber);

  // Try to load existing summary (in production, this would come from storage)
  let summary: PRSummary | null = null;
  const existingSummary = await github.getBotComments(prNumber, BOT_IDENTIFIER_SUMMARY);
  if (existingSummary.length > 0) {
    // We have a summary posted, but we'd need to re-analyze to get structured data
    // For now, we'll work without it
    summary = null;
  }

  await processComment(commentContext, pr, summary, claude, github, BOT_USERNAME);

  core.info('Comment handling complete');
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    const config = loadConfig();
    const context = parseActionContext();

    core.info(`Event: ${context.eventName}, Action: ${context.action}`);
    core.info(`Mode: ${config.mode}`);

    const github = new GitHubClient(config.githubToken, context.repo.owner, context.repo.repo);
    const claude = new ClaudeClient(config.anthropicApiKey, config.model);

    // Route based on event and action
    if (context.eventName === 'pull_request') {
      const prNumber = context.prNumber;
      if (!prNumber) {
        core.setFailed('No PR number found in context');
        return;
      }

      switch (context.action) {
        case 'opened':
        case 'synchronize':
        case 'ready_for_review':
          // New, updated, or ready PR - route based on draft status
          if (config.mode === 'auto') {
            const pr = await github.getPullRequest(prNumber);
            if (pr.draft) {
              await handleDraftPR(github, claude, prNumber, config);
            } else {
              await handleReadyPR(github, claude, prNumber, config);
            }
          } else if (config.mode === 'draft-only') {
            await handleDraftPR(github, claude, prNumber, config);
          } else if (config.mode === 'ready-only') {
            await handleReadyPR(github, claude, prNumber, config);
          }
          break;

        default:
          core.info(`Ignoring action: ${context.action}`);
      }
    } else if (context.eventName === 'issue_comment' || context.eventName === 'pull_request_review_comment') {
      // Comment on PR
      if (config.mode === 'auto' || config.mode === 'interactive-only') {
        const prNumber = context.prNumber;
        const commentId = context.commentId;

        if (!prNumber || !commentId) {
          core.info('Not a PR comment or missing context, skipping');
          return;
        }

        await handleComment(github, claude, prNumber, commentId, config);
      }
    } else {
      core.info(`Unsupported event: ${context.eventName}`);
    }

    core.info('AI PR Helper completed successfully');
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unknown error occurred');
    }
  }
}

main();
