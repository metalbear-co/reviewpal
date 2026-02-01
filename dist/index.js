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
const claude_js_1 = require("./api/claude.js");
const friendly_js_1 = require("./formatters/friendly.js");
const types_js_1 = require("./types.js");
const VERSION = '1.2.0';
async function main() {
    const program = new commander_1.Command();
    program
        .name('reviewpal')
        .description('AI-powered code review for any language')
        .version(VERSION)
        .argument('[input]', 'Diff file, git range, or - for stdin')
        .option('-g, --git <range>', 'Use git diff for the specified range')
        .option('-f, --format <type>', 'Output format: friendly, json', 'friendly')
        .option('-m, --max-hunks <n>', 'Maximum hunks to analyze', '20')
        .option('--model <name>', 'Claude model to use', types_js_1.DEFAULT_CONFIG.model)
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
        // Initialize Claude
        spinner.start('Initializing AI...');
        try {
            (0, claude_js_1.initClaudeClient)();
            spinner.succeed('AI ready');
        }
        catch (e) {
            spinner.fail('AI initialization failed');
            console.error(chalk_1.default.red('\nANTHROPIC_API_KEY environment variable required.'));
            console.error(chalk_1.default.dim('Get your key at: https://console.anthropic.com'));
            process.exit(1);
        }
        // Analyze hunks
        const maxHunks = parseInt(options.maxHunks, 10);
        const startTime = Date.now();
        const fileAnalyses = [];
        let processedHunks = 0;
        for (const file of parsed.files) {
            const hunkAnalyses = [];
            for (const hunk of file.hunks.slice(0, maxHunks - processedHunks)) {
                if (processedHunks >= maxHunks)
                    break;
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
        const result = {
            files: fileAnalyses,
            totalHunks: processedHunks,
            totalProcessingTime: totalTime,
            aiCodeLikelihood: 'medium'
        };
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
 * Get diff content from various sources
 */
async function getDiffContent(input, gitRange) {
    // Git range specified
    if (gitRange) {
        return (0, child_process_1.execSync)(`git diff ${gitRange}`, { encoding: 'utf-8' });
    }
    // Stdin
    if (input === '-' || !input) {
        if (process.stdin.isTTY) {
            // No stdin, try git diff of staged changes
            try {
                return (0, child_process_1.execSync)('git diff --cached', { encoding: 'utf-8' });
            }
            catch {
                return (0, child_process_1.execSync)('git diff HEAD~1', { encoding: 'utf-8' });
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
    if ((0, fs_1.existsSync)(input)) {
        return (0, fs_1.readFileSync)(input, 'utf-8');
    }
    // Assume it's a git range
    return (0, child_process_1.execSync)(`git diff ${input}`, { encoding: 'utf-8' });
}
/**
 * Analyze a single hunk with AI
 */
async function analyzeHunk(hunk, filename, model) {
    const startTime = Date.now();
    const addedCode = hunk.additions.join('\n');
    const review = await (0, claude_js_1.reviewCode)(addedCode, filename, model);
    return {
        hunk,
        aiReview: review,
        processingTime: Date.now() - startTime
    };
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
// Run
main().catch(console.error);
//# sourceMappingURL=index.js.map