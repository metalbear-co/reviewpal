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
import { initClaudeClient, reviewCode } from './api/claude.js';
import { formatFriendlyReviewResult } from './formatters/friendly.js';
import {
  DiffHunk,
  HunkAnalysis,
  FileAnalysis,
  ReviewResult,
  OutputFormat,
  DEFAULT_CONFIG
} from './types.js';

const VERSION = '1.2.0';

async function main() {
  const program = new Command();
  
  program
    .name('reviewpal')
    .description('AI-powered code review for any language')
    .version(VERSION)
    .argument('[input]', 'Diff file, git range, or - for stdin')
    .option('-g, --git <range>', 'Use git diff for the specified range')
    .option('-f, --format <type>', 'Output format: friendly, json', 'friendly')
    .option('-m, --max-hunks <n>', 'Maximum hunks to analyze', '20')
    .option('--model <name>', 'Claude model to use', DEFAULT_CONFIG.model)
    .option('-q, --quiet', 'Minimal output')
    .action(runReview);
  
  await program.parseAsync(process.argv);
}

async function runReview(
  input: string | undefined,
  options: {
    git?: string;
    format: string;
    maxHunks: string;
    model: string;
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
    
    // Initialize Claude
    spinner.start('Initializing AI...');
    try {
      initClaudeClient();
      spinner.succeed('AI ready');
    } catch (e) {
      spinner.fail('AI initialization failed');
      console.error(chalk.red('\nANTHROPIC_API_KEY environment variable required.'));
      console.error(chalk.dim('Get your key at: https://console.anthropic.com'));
      process.exit(1);
    }
    
    // Analyze hunks
    const maxHunks = parseInt(options.maxHunks, 10);
    const startTime = Date.now();
    const fileAnalyses: FileAnalysis[] = [];
    let processedHunks = 0;
    
    for (const file of parsed.files) {
      const hunkAnalyses: HunkAnalysis[] = [];
      
      for (const hunk of file.hunks.slice(0, maxHunks - processedHunks)) {
        if (processedHunks >= maxHunks) break;
        
        spinner.start(`Analyzing ${file.filename}:${hunk.startLine}...`);
        const analysis = await analyzeHunk(hunk, file.filename, options.model);
        hunkAnalyses.push(analysis);
        
        processedHunks++;
      }
      
      fileAnalyses.push({
        filename: file.filename,
        hunks: hunkAnalyses,
        overallComplexity: 0
      });
    }
    
    const totalTime = Date.now() - startTime;
    spinner.succeed(`Analysis complete (${(totalTime / 1000).toFixed(1)}s)`);
    
    // Build result
    const result: ReviewResult = {
      files: fileAnalyses,
      totalHunks: processedHunks,
      totalProcessingTime: totalTime,
      aiCodeLikelihood: 'medium'
    };
    
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
  // Git range specified
  if (gitRange) {
    return execSync(`git diff ${gitRange}`, { encoding: 'utf-8' });
  }
  
  // Stdin
  if (input === '-' || !input) {
    if (process.stdin.isTTY) {
      // No stdin, try git diff of staged changes
      try {
        return execSync('git diff --cached', { encoding: 'utf-8' });
      } catch {
        return execSync('git diff HEAD~1', { encoding: 'utf-8' });
      }
    }
    
    // Read from stdin
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
  
  // File path
  if (existsSync(input)) {
    return readFileSync(input, 'utf-8');
  }
  
  // Assume it's a git range
  return execSync(`git diff ${input}`, { encoding: 'utf-8' });
}

/**
 * Analyze a single hunk with AI
 */
async function analyzeHunk(
  hunk: DiffHunk,
  filename: string,
  model: string
): Promise<HunkAnalysis> {
  const startTime = Date.now();
  
  const addedCode = hunk.additions.join('\n');
  const review = await reviewCode(addedCode, filename, model);
  
  return {
    hunk,
    aiReview: review,
    processingTime: Date.now() - startTime
  };
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

// Run
main().catch(console.error);
