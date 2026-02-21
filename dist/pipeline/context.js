"use strict";
/**
 * Architecture context loading for ReviewPal
 * Reads CLAUDE.md and optionally .reviewpal.yml for config.
 * Fetches CLAUDE.md from related repos via GitHub API.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadArchitectureContext = loadArchitectureContext;
const fs_1 = require("fs");
const path_1 = require("path");
const child_process_1 = require("child_process");
const js_yaml_1 = __importDefault(require("js-yaml"));
const DEFAULT_CONFIG = {
    skip_patterns: [],
    review_instructions: [],
    focus_areas: [],
    context_files: [],
    related_repos: [],
    max_api_calls: 10,
};
const MAX_CONTEXT_CHARS = 4000;
/**
 * Check if a context_files entry is a cross-repo reference.
 * Format: "org/repo:path/to/file"
 */
function parseCrossRepoRef(entry) {
    const match = entry.match(/^([^/]+\/[^:]+):(.+)$/);
    if (!match)
        return null;
    const [, ownerRepo, filePath] = match;
    const [owner, repo] = ownerRepo.split('/');
    if (!owner || !repo || !filePath)
        return null;
    return { owner, repo, path: filePath };
}
/**
 * Fetch a file from another GitHub repo using the gh CLI.
 * Requires GITHUB_TOKEN or gh auth to have access to the target repo.
 */
function fetchGitHubFile(owner, repo, filePath) {
    try {
        const result = (0, child_process_1.execSync)(`gh api "/repos/${owner}/${repo}/contents/${filePath}" --jq '.content' 2>/dev/null`, { encoding: 'utf-8', timeout: 10000 }).trim();
        if (!result)
            return null;
        // GitHub API returns base64-encoded content
        return Buffer.from(result, 'base64').toString('utf-8');
    }
    catch {
        return null;
    }
}
/**
 * Load architecture context from CLAUDE.md and .reviewpal.yml
 *
 * Works with zero config: just reads CLAUDE.md from the repo root.
 * Optional .reviewpal.yml adds:
 *   - related_repos: list of "org/repo" to auto-fetch their CLAUDE.md
 *   - skip_patterns: glob patterns for files to skip
 *   - context_files: additional local or cross-repo files ("org/repo:path")
 *   - review_instructions, focus_areas: optional power-user overrides
 */
function loadArchitectureContext(repoRoot) {
    const root = repoRoot || process.cwd();
    const contextParts = [];
    let config = { ...DEFAULT_CONFIG };
    // Load .reviewpal.yml (optional)
    const configPath = (0, path_1.join)(root, '.reviewpal.yml');
    if ((0, fs_1.existsSync)(configPath)) {
        try {
            const raw = (0, fs_1.readFileSync)(configPath, 'utf-8');
            const parsed = js_yaml_1.default.load(raw);
            if (parsed && typeof parsed === 'object') {
                config = {
                    skip_patterns: asStringArray(parsed.skip_patterns),
                    review_instructions: asStringArray(parsed.review_instructions),
                    focus_areas: asStringArray(parsed.focus_areas),
                    context_files: asStringArray(parsed.context_files),
                    related_repos: asStringArray(parsed.related_repos),
                    max_api_calls: typeof parsed.max_api_calls === 'number' ? parsed.max_api_calls : DEFAULT_CONFIG.max_api_calls,
                };
            }
        }
        catch {
            // Ignore invalid yaml
        }
    }
    // Load lessons file (.reviewpal-lessons.md)
    let lessonsContext = '';
    const lessonsPath = (0, path_1.join)(root, '.reviewpal-lessons.md');
    if ((0, fs_1.existsSync)(lessonsPath)) {
        const content = (0, fs_1.readFileSync)(lessonsPath, 'utf-8');
        lessonsContext = truncateAtSectionBoundary(content, 3000);
    }
    // Load local CLAUDE.md
    const claudeMdPath = (0, path_1.join)(root, 'CLAUDE.md');
    if ((0, fs_1.existsSync)(claudeMdPath)) {
        const content = (0, fs_1.readFileSync)(claudeMdPath, 'utf-8');
        const truncated = truncateAtSectionBoundary(content, MAX_CONTEXT_CHARS);
        contextParts.push(`## Project Architecture (from CLAUDE.md)\n\n${truncated}`);
    }
    // Auto-fetch CLAUDE.md from related repos
    for (const repoRef of config.related_repos) {
        const parts = repoRef.split('/');
        if (parts.length !== 2)
            continue;
        const [owner, repo] = parts;
        const content = fetchGitHubFile(owner, repo, 'CLAUDE.md');
        if (content) {
            const truncated = truncateAtSectionBoundary(content, 2000);
            contextParts.push(`## Related repo: ${owner}/${repo} (from CLAUDE.md)\n\n${truncated}`);
        }
    }
    // Load additional context files (local or cross-repo)
    for (const contextFile of config.context_files) {
        const crossRef = parseCrossRepoRef(contextFile);
        if (crossRef) {
            const content = fetchGitHubFile(crossRef.owner, crossRef.repo, crossRef.path);
            if (content) {
                const truncated = truncateAtSectionBoundary(content, 2000);
                contextParts.push(`## Context from ${crossRef.owner}/${crossRef.repo}:${crossRef.path}\n\n${truncated}`);
            }
        }
        else {
            const filePath = (0, path_1.join)(root, contextFile);
            if ((0, fs_1.existsSync)(filePath)) {
                try {
                    const content = (0, fs_1.readFileSync)(filePath, 'utf-8');
                    const truncated = truncateAtSectionBoundary(content, 2000);
                    contextParts.push(`## Context from ${contextFile}\n\n${truncated}`);
                }
                catch {
                    // Skip unreadable files
                }
            }
        }
    }
    // Add review instructions (optional power-user config)
    if (config.review_instructions.length > 0) {
        contextParts.push(`## Review Instructions\n\n${config.review_instructions.map(r => `- ${r}`).join('\n')}`);
    }
    // Add focus areas (optional power-user config)
    if (config.focus_areas.length > 0) {
        contextParts.push(`## Cross-System Rules\n\n${config.focus_areas.map(r => `- ${r}`).join('\n')}`);
    }
    return {
        architectureContext: contextParts.join('\n\n'),
        lessonsContext,
        config,
    };
}
/**
 * Truncate text at the nearest section boundary (## heading) before maxChars
 */
function truncateAtSectionBoundary(text, maxChars) {
    if (text.length <= maxChars)
        return text;
    const truncated = text.slice(0, maxChars);
    const lastHeading = truncated.lastIndexOf('\n## ');
    if (lastHeading > maxChars * 0.5) {
        return truncated.slice(0, lastHeading) + '\n\n[truncated]';
    }
    const lastParagraph = truncated.lastIndexOf('\n\n');
    if (lastParagraph > maxChars * 0.5) {
        return truncated.slice(0, lastParagraph) + '\n\n[truncated]';
    }
    return truncated + '\n\n[truncated]';
}
function asStringArray(val) {
    if (!Array.isArray(val))
        return [];
    return val.filter((item) => typeof item === 'string');
}
//# sourceMappingURL=context.js.map