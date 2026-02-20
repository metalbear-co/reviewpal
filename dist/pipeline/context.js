"use strict";
/**
 * Architecture context loading for ReviewPal
 * Reads CLAUDE.md and .reviewpal.yml to provide project context to AI reviews
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadArchitectureContext = loadArchitectureContext;
const fs_1 = require("fs");
const path_1 = require("path");
const js_yaml_1 = __importDefault(require("js-yaml"));
const DEFAULT_CONFIG = {
    skip_patterns: [],
    review_instructions: [],
    focus_areas: [],
    context_files: [],
    max_api_calls: 10,
};
const MAX_CONTEXT_CHARS = 4000;
/**
 * Load architecture context from CLAUDE.md and .reviewpal.yml
 */
function loadArchitectureContext(repoRoot) {
    const root = repoRoot || process.cwd();
    const contextParts = [];
    let config = { ...DEFAULT_CONFIG };
    // Load .reviewpal.yml
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
                    max_api_calls: typeof parsed.max_api_calls === 'number' ? parsed.max_api_calls : DEFAULT_CONFIG.max_api_calls,
                };
            }
        }
        catch {
            // Ignore invalid yaml
        }
    }
    // Load CLAUDE.md
    const claudeMdPath = (0, path_1.join)(root, 'CLAUDE.md');
    if ((0, fs_1.existsSync)(claudeMdPath)) {
        const content = (0, fs_1.readFileSync)(claudeMdPath, 'utf-8');
        const truncated = truncateAtSectionBoundary(content, MAX_CONTEXT_CHARS);
        contextParts.push(`## Project Architecture (from CLAUDE.md)\n\n${truncated}`);
    }
    // Load additional context files from config
    for (const contextFile of config.context_files) {
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
    // Add review instructions
    if (config.review_instructions.length > 0) {
        contextParts.push(`## Review Instructions\n\n${config.review_instructions.map(r => `- ${r}`).join('\n')}`);
    }
    // Add focus areas (cross-system rules)
    if (config.focus_areas.length > 0) {
        contextParts.push(`## Cross-System Rules\n\n${config.focus_areas.map(r => `- ${r}`).join('\n')}`);
    }
    return {
        architectureContext: contextParts.join('\n\n'),
        config,
    };
}
/**
 * Truncate text at the nearest section boundary (## heading) before maxChars
 */
function truncateAtSectionBoundary(text, maxChars) {
    if (text.length <= maxChars)
        return text;
    // Find the last section heading before the limit
    const truncated = text.slice(0, maxChars);
    const lastHeading = truncated.lastIndexOf('\n## ');
    if (lastHeading > maxChars * 0.5) {
        return truncated.slice(0, lastHeading) + '\n\n[truncated]';
    }
    // Fall back to last paragraph break
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