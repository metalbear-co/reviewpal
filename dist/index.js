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
const adversarial_js_1 = require("./pipeline/adversarial.js");
const validate_js_1 = require("./pipeline/validate.js");
const verdict_js_1 = require("./pipeline/verdict.js");
const VERSION = '3.2.0';
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
        .option('--max-api-calls <n>', 'Maximum API calls (1 triage + N deep reviews + 3 adversarial)', '10')
        .option('--model <name>', 'Gemini model to use', DEFAULT_MODEL)
        .option('--repo-root <path>', 'Repository root for loading CLAUDE.md and .reviewpal.yml')
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
        const { architectureContext, lessonsContext, config } = (0, context_js_1.loadArchitectureContext)(options.repoRoot || process.env.GITHUB_WORKSPACE || process.cwd());
        if (architectureContext) {
            spinner.succeed('Loaded project context');
        }
        else {
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
        const triageResult = await (0, triage_js_1.triagePR)(client, filesToAnalyze, architectureContext, config, options.model);
        spinner.succeed(`Triage complete: ${triageResult.highPriorityFiles.length} files prioritized`);
        if (triageResult.crossSystemImplications.length > 0) {
            spinner.info(`Found ${triageResult.crossSystemImplications.length} cross-system implication(s)`);
        }
        // Run deep review and adversarial passes in parallel
        const adversarialBudget = 3;
        const deepBudget = Math.max(1, maxApiCalls - adversarialBudget);
        spinner.start(`Deep reviewing ${Math.min(triageResult.highPriorityFiles.length, deepBudget)} files + adversarial passes...`);
        const [deepReviews, adversarialFindings] = await Promise.all([
            (0, deep_review_js_1.reviewPrioritizedFiles)(client, filesToAnalyze, triageResult, architectureContext, lessonsContext, config, options.model, deepBudget),
            (0, adversarial_js_1.runAdversarialReview)(client, filesToAnalyze, triageResult, architectureContext, lessonsContext, config, options.model, adversarialBudget),
        ]);
        spinner.succeed(`Review complete (${deepReviews.length} files deep-reviewed, ${adversarialFindings.length} adversarial findings)`);
        // Validate findings (filter false positives)
        const totalFindings = deepReviews.reduce((s, r) => s + r.critical.length, 0) + adversarialFindings.length;
        let validatedDeep = deepReviews;
        let validatedAdversarial = adversarialFindings;
        if (totalFindings > 0) {
            spinner.start(`Validating ${totalFindings} finding(s)...`);
            const validation = await (0, validate_js_1.validateFindings)(client, filesToAnalyze, deepReviews, adversarialFindings, options.model);
            validatedDeep = validation.deepReviews;
            validatedAdversarial = validation.adversarialFindings;
            if (validation.filteredCount > 0) {
                spinner.succeed(`Filtered ${validation.filteredCount} false positive(s)`);
            }
            else {
                spinner.succeed(`All ${totalFindings} finding(s) validated`);
            }
        }
        // Compute verdict
        const verdict = (0, verdict_js_1.computeVerdict)(validatedDeep, validatedAdversarial);
        const verdictEmoji = verdict.verdict === 'BLOCK' ? '🔴' : verdict.verdict === 'WARN' ? '🟡' : '🟢';
        spinner.info(`Verdict: ${verdictEmoji} ${verdict.verdict} - ${verdict.reason}`);
        // Build ReviewResult (use validated findings)
        const fileAnalyses = validatedDeep.map(dr => ({
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
        const result = {
            files: fileAnalyses,
            totalHunks: totalHunks,
            totalProcessingTime: Date.now() - startTime,
            triage: triageResult,
            deepReviews: validatedDeep,
            adversarialFindings: validatedAdversarial,
            verdict,
        };
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