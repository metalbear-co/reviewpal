#!/usr/bin/env node

/**
 * ReviewPal - AI-powered code review for any language
 *
 * Usage:
 *   reviewpal <diff-input>
 *   git diff HEAD~1 | reviewpal -
 *   reviewpal --git HEAD~3..HEAD
 */

import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import ora from 'ora';
import chalk from 'chalk';

import { parseDiff } from './parsers/diff.js';
import { createGeminiClient } from './api/gemini.js';
import { formatFriendlyReviewResult } from './formatters/friendly.js';
import { loadArchitectureContext } from './pipeline/context.js';
import { triagePR } from './pipeline/triage.js';
import { reviewPrioritizedFiles } from './pipeline/deep-review.js';
import { runAdversarialReview } from './pipeline/adversarial.js';
import { computeVerdict } from './pipeline/verdict.js';
import {
  FileAnalysis,
  ReviewResult,
  OutputFormat,
} from './types.js';

const VERSION = '3.2.0';
const DEFAULT_MODEL = 'gemini-2.5-pro';

async function main() {
  const program = new Command();

  program
    .name('reviewpal')
    .description('AI-powered code review for any language')
    .version(VERSION)
    .argument('[input]', 'Diff file, git range, or - for stdin')
    .option('-g, --git <range>', 'Use git diff for the specified range')
    .option('-f, --format <type>', 'Output format: friendly, json', 'friendly')
    .option('--max-api-calls <n>', 'Maximum API calls (1 triage + N deep reviews + 3 adversarial)', '10')
    .option('--model <name>', 'Gemini model to use', DEFAULT_MODEL)
    .option('--repo-root <path>', 'Repository root for loading CLAUDE.md and .reviewpal.yml')
    .option('-q, --quiet', 'Minimal output')
    .action(runReview);

  await program.parseAsync(process.argv);
}

async function runReview(
  input: string | undefined,
  options: {
    git?: string;
    format: string;
    maxApiCalls: string;
    model: string;
    repoRoot?: string;
    quiet: boolean;
  }
) {
  const spinner = ora({ isSilent: options.quiet });

  try {
    // Get diff content
    spinner.start('Reading diff...');
    const diffContent = await getDiffContent(input, options.git);

    if (!diffContent.trim()) {
      spinner.fail('No diff content found');
      process.exit(1);
    }

    spinner.succeed(`Read diff (${diffContent.split('\n').length} lines)`);

    // Parse diff
    spinner.start('Parsing diff...');
    const parsed = parseDiff(diffContent);

    if (parsed.files.length === 0) {
      spinner.warn('No files in diff');
      process.exit(0);
    }

    const totalHunks = parsed.files.reduce((a, f) => a + f.hunks.length, 0);
    spinner.succeed(`Parsed ${parsed.files.length} files, ${totalHunks} hunks`);

    // Initialize Gemini client
    spinner.start('Initializing AI...');
    let client;
    try {
      client = createGeminiClient();
      spinner.succeed('AI ready (Gemini)');
    } catch (e) {
      spinner.fail('AI initialization failed');
      console.error(chalk.red('\nGEMINI_API_KEY or GOOGLE_API_KEY environment variable required.'));
      console.error(chalk.dim('Get your key at: https://aistudio.google.com/apikey'));
      process.exit(1);
    }

    // Load architecture context
    spinner.start('Loading project context...');
    const { architectureContext, lessonsContext, config } = loadArchitectureContext(
      options.repoRoot || process.env.GITHUB_WORKSPACE || process.cwd()
    );
    if (architectureContext) {
      spinner.succeed('Loaded project context');
    } else {
      spinner.info('No CLAUDE.md or .reviewpal.yml found (continuing without project context)');
    }
    if (lessonsContext) {
      spinner.info('Loaded lessons from .reviewpal-lessons.md');
    }

    // Apply skip_patterns from config
    let filesToAnalyze = parsed.files;
    if (config.skip_patterns.length > 0) {
      const originalCount = filesToAnalyze.length;
      filesToAnalyze = filesToAnalyze.filter(f => {
        return !config.skip_patterns.some(pattern => matchGlob(f.filename, pattern));
      });
      if (filesToAnalyze.length < originalCount) {
        spinner.info(`Skipped ${originalCount - filesToAnalyze.length} files matching skip_patterns`);
      }
    }

    const startTime = Date.now();
    const maxApiCalls = parseInt(options.maxApiCalls, 10) || config.max_api_calls;

    // Triage
    spinner.start('Triaging PR changes...');
    const triageResult = await triagePR(
      client, filesToAnalyze, architectureContext, config, options.model
    );
    spinner.succeed(`Triage complete: ${triageResult.highPriorityFiles.length} files prioritized`);

    if (triageResult.crossSystemImplications.length > 0) {
      spinner.info(
        `Found ${triageResult.crossSystemImplications.length} cross-system implication(s)`
      );
    }

    // Run deep review and adversarial passes in parallel
    const adversarialBudget = 3;
    const deepBudget = Math.max(1, maxApiCalls - adversarialBudget);
    spinner.start(`Deep reviewing ${Math.min(triageResult.highPriorityFiles.length, deepBudget)} files + adversarial passes...`);

    const [deepReviews, adversarialFindings] = await Promise.all([
      reviewPrioritizedFiles(
        client, filesToAnalyze, triageResult, architectureContext, lessonsContext, config, options.model, deepBudget
      ),
      runAdversarialReview(
        client, filesToAnalyze, triageResult, architectureContext, lessonsContext, config, options.model, adversarialBudget
      ),
    ]);

    spinner.succeed(`Review complete (${deepReviews.length} files deep-reviewed, ${adversarialFindings.length} adversarial findings)`);

    // Compute verdict
    const verdict = computeVerdict(deepReviews, adversarialFindings);
    const verdictEmoji = verdict.verdict === 'BLOCK' ? '🔴' : verdict.verdict === 'WARN' ? '🟡' : '🟢';
    spinner.info(`Verdict: ${verdictEmoji} ${verdict.verdict} - ${verdict.reason}`);

    // Build ReviewResult
    const fileAnalyses: FileAnalysis[] = deepReviews.map(dr => ({
      filename: dr.filename,
      hunks: [{
        hunk: {
          filename: dr.filename,
          fileDiffHash: parsed.files.find(f => f.filename === dr.filename)?.hunks[0]?.fileDiffHash,
          startLine: parsed.files.find(f => f.filename === dr.filename)?.hunks[0]?.startLine || 1,
          endLine: parsed.files.find(f => f.filename === dr.filename)?.hunks[0]?.endLine || 1,
          content: '',
          additions: [],
          deletions: [],
          context: '',
        },
        aiReview: {
          summary: dr.summary,
          critical: dr.critical,
          language: dr.language,
        },
        processingTime: 0,
      }],
      overallComplexity: 0,
    }));

    const result: ReviewResult = {
      files: fileAnalyses,
      totalHunks: totalHunks,
      totalProcessingTime: Date.now() - startTime,
      triage: triageResult,
      deepReviews,
      adversarialFindings,
      verdict,
    };

    result.totalProcessingTime = Date.now() - startTime;
    spinner.succeed(`Analysis complete (${(result.totalProcessingTime / 1000).toFixed(1)}s)`);

    // Format and output
    const output = formatOutput(result, options.format as OutputFormat);
    console.log(output);

  } catch (error) {
    spinner.fail('Analysis failed');
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

/**
 * Get diff content from various sources
 */
async function getDiffContent(input?: string, gitRange?: string): Promise<string> {
  if (gitRange) {
    return execSync(`git diff ${gitRange}`, { encoding: 'utf-8' });
  }

  if (input === '-' || !input) {
    if (process.stdin.isTTY) {
      try {
        return execSync('git diff --cached', { encoding: 'utf-8' });
      } catch {
        return execSync('git diff HEAD~1', { encoding: 'utf-8' });
      }
    }

    return new Promise((resolve) => {
      let data = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('readable', () => {
        let chunk;
        while ((chunk = process.stdin.read()) !== null) {
          data += chunk;
        }
      });
      process.stdin.on('end', () => resolve(data));
    });
  }

  if (existsSync(input)) {
    return readFileSync(input, 'utf-8');
  }

  return execSync(`git diff ${input}`, { encoding: 'utf-8' });
}

/**
 * Format output based on requested format
 */
function formatOutput(result: ReviewResult, format: OutputFormat): string {
  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }
  return formatFriendlyReviewResult(result);
}

/**
 * Simple glob matching for skip_patterns
 */
function matchGlob(filename: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{DOUBLESTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{DOUBLESTAR\}\}/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${regexStr}$`).test(filename);
}

// Run
main().catch(console.error);
