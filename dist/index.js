#!/usr/bin/env node
"use strict";
/**
 * ReviewPal - AI-powered code review for any language
 *
 * Usage:
 *   reviewpal <diff-input>
 *   git diff HEAD~1 | reviewpal -
 *   reviewpal --git HEAD~3..HEAD
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const fs_1 = require("fs");
const child_process_1 = require("child_process");
const ora_1 = __importDefault(require("ora"));
const chalk_1 = __importDefault(require("chalk"));
const diff_js_1 = require("./parsers/diff.js");
const gemini_js_1 = require("./api/gemini.js");
const friendly_js_1 = require("./formatters/friendly.js");
const context_js_1 = require("./pipeline/context.js");
const triage_js_1 = require("./pipeline/triage.js");
const deep_review_js_1 = require("./pipeline/deep-review.js");
const VERSION = '3.0.0';
const DEFAULT_MODEL = 'gemini-2.5-pro';
async function main() {
    const program = new commander_1.Command();
    program
        .name('reviewpal')
        .description('AI-powered code review for any language')
        .version(VERSION)
        .argument('[input]', 'Diff file, git range, or - for stdin')
        .option('-g, --git <range>', 'Use git diff for the specified range')
        .option('-f, --format <type>', 'Output format: friendly, json', 'friendly')
        .option('-m, --max-hunks <n>', 'Maximum hunks to analyze (legacy mode)', '20')
        .option('--max-api-calls <n>', 'Maximum API calls for triage pipeline', '10')
        .option('--model <name>', 'Gemini model to use', DEFAULT_MODEL)
        .option('--repo-root <path>', 'Repository root for loading CLAUDE.md and .reviewpal.yml')
        .option('--legacy', 'Use legacy per-hunk analysis instead of triage pipeline')
        .option('-q, --quiet', 'Minimal output')
        .action(runReview);
    await program.parseAsync(process.argv);
}
async function runReview(input, options) {
    const spinner = (0, ora_1.default)({ isSilent: options.quiet });
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
        const parsed = (0, diff_js_1.parseDiff)(diffContent);
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
            client = (0, gemini_js_1.createGeminiClient)();
            spinner.succeed('AI ready (Gemini)');
        }
        catch (e) {
            spinner.fail('AI initialization failed');
            console.error(chalk_1.default.red('\nGEMINI_API_KEY or GOOGLE_API_KEY environment variable required.'));
            console.error(chalk_1.default.dim('Get your key at: https://aistudio.google.com/apikey'));
            process.exit(1);
        }
        // Load architecture context
        spinner.start('Loading project context...');
        const { architectureContext, config } = (0, context_js_1.loadArchitectureContext)(options.repoRoot || process.env.GITHUB_WORKSPACE || process.cwd());
        if (architectureContext) {
            spinner.succeed('Loaded project context');
        }
        else {
            spinner.info('No CLAUDE.md or .reviewpal.yml found (continuing without project context)');
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
        let result;
        if (options.legacy) {
            // Legacy mode: per-hunk analysis (backward compatible)
            result = await runLegacyPipeline(client, filesToAnalyze, options, architectureContext, spinner);
        }
        else {
            // New triage pipeline
            const maxApiCalls = parseInt(options.maxApiCalls, 10) || config.max_api_calls;
            spinner.start('Triaging PR changes...');
            const triageResult = await (0, triage_js_1.triagePR)(client, filesToAnalyze, architectureContext, config, options.model);
            spinner.succeed(`Triage complete: ${triageResult.highPriorityFiles.length} files prioritized`);
            if (triageResult.crossSystemImplications.length > 0) {
                spinner.info(`Found ${triageResult.crossSystemImplications.length} cross-system implication(s)`);
            }
            spinner.start(`Deep reviewing ${Math.min(triageResult.highPriorityFiles.length, maxApiCalls - 1)} files...`);
            const deepReviews = await (0, deep_review_js_1.reviewPrioritizedFiles)(client, filesToAnalyze, triageResult, architectureContext, config, options.model, maxApiCalls);
            spinner.succeed(`Deep review complete (${deepReviews.length} files reviewed)`);
            // Build ReviewResult for backward-compatible formatting
            const fileAnalyses = deepReviews.map(dr => ({
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
            result = {
                files: fileAnalyses,
                totalHunks: totalHunks,
                totalProcessingTime: Date.now() - startTime,
                aiCodeLikelihood: 'medium',
                triage: triageResult,
                deepReviews,
            };
        }
        result.totalProcessingTime = Date.now() - startTime;
        spinner.succeed(`Analysis complete (${(result.totalProcessingTime / 1000).toFixed(1)}s)`);
        // Format and output
        const output = formatOutput(result, options.format);
        console.log(output);
    }
    catch (error) {
        spinner.fail('Analysis failed');
        console.error(chalk_1.default.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
    }
}
/**
 * Legacy per-hunk analysis pipeline (backward compatible)
 */
async function runLegacyPipeline(client, files, options, architectureContext, spinner) {
    const maxHunks = parseInt(options.maxHunks, 10);
    const startTime = Date.now();
    const fileAnalyses = [];
    let processedHunks = 0;
    for (const file of files) {
        const hunkAnalyses = [];
        for (const hunk of file.hunks.slice(0, maxHunks - processedHunks)) {
            if (processedHunks >= maxHunks)
                break;
            spinner.start(`Analyzing ${file.filename}:${hunk.startLine}...`);
            const analysis = await analyzeHunk(client, hunk, file.filename, options.model, architectureContext);
            hunkAnalyses.push(analysis);
            processedHunks++;
        }
        fileAnalyses.push({
            filename: file.filename,
            hunks: hunkAnalyses,
            overallComplexity: 0
        });
    }
    return {
        files: fileAnalyses,
        totalHunks: processedHunks,
        totalProcessingTime: Date.now() - startTime,
        aiCodeLikelihood: 'medium'
    };
}
/**
 * Analyze a single hunk with AI (legacy mode, sends full unified diff)
 */
async function analyzeHunk(client, hunk, filename, model, architectureContext) {
    const startTime = Date.now();
    const review = await (0, gemini_js_1.reviewCode)(client, hunk.content, filename, model, architectureContext);
    return {
        hunk,
        aiReview: review,
        processingTime: Date.now() - startTime
    };
}
/**
 * Get diff content from various sources
 */
async function getDiffContent(input, gitRange) {
    if (gitRange) {
        return (0, child_process_1.execSync)(`git diff ${gitRange}`, { encoding: 'utf-8' });
    }
    if (input === '-' || !input) {
        if (process.stdin.isTTY) {
            try {
                return (0, child_process_1.execSync)('git diff --cached', { encoding: 'utf-8' });
            }
            catch {
                return (0, child_process_1.execSync)('git diff HEAD~1', { encoding: 'utf-8' });
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
    if ((0, fs_1.existsSync)(input)) {
        return (0, fs_1.readFileSync)(input, 'utf-8');
    }
    return (0, child_process_1.execSync)(`git diff ${input}`, { encoding: 'utf-8' });
}
/**
 * Format output based on requested format
 */
function formatOutput(result, format) {
    if (format === 'json') {
        return JSON.stringify(result, null, 2);
    }
    return (0, friendly_js_1.formatFriendlyReviewResult)(result);
}
/**
 * Simple glob matching for skip_patterns
 */
function matchGlob(filename, pattern) {
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
//# sourceMappingURL=index.js.map