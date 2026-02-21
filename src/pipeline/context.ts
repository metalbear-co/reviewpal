/**
 * Architecture context loading for ReviewPal
 * Reads CLAUDE.md and optionally .reviewpal.yml for config.
 * Fetches CLAUDE.md from related repos via GitHub API.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import yaml from 'js-yaml';

export interface ReviewPalConfig {
  skip_patterns: string[];
  review_instructions: string[];
  focus_areas: string[];
  context_files: string[];
  related_repos: string[];
  max_api_calls: number;
}

export interface ArchitectureContext {
  architectureContext: string;
  lessonsContext: string;
  config: ReviewPalConfig;
  relatedReposLoaded: string[];
}

const DEFAULT_CONFIG: ReviewPalConfig = {
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
function parseCrossRepoRef(entry: string): { owner: string; repo: string; path: string } | null {
  const match = entry.match(/^([^/]+\/[^:]+):(.+)$/);
  if (!match) return null;
  const [, ownerRepo, filePath] = match;
  const [owner, repo] = ownerRepo.split('/');
  if (!owner || !repo || !filePath) return null;
  return { owner, repo, path: filePath };
}

/**
 * Fetch a file from another GitHub repo using the gh CLI.
 * Optionally specify a branch/ref to fetch from (defaults to default branch).
 * Requires GITHUB_TOKEN or gh auth to have access to the target repo.
 */
export function fetchGitHubFile(owner: string, repo: string, filePath: string, ref?: string): string | null {
  try {
    const refParam = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const result = execSync(
      `gh api "/repos/${owner}/${repo}/contents/${filePath}${refParam}" --jq '.content' 2>/dev/null`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();

    if (!result) return null;

    // GitHub API returns base64-encoded content
    return Buffer.from(result, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

/**
 * Auto-detect related repos from CLAUDE.md content.
 * Looks for patterns like:
 *   - "See @../reponame/CLAUDE.md"
 *   - "(source in `../reponame/`)"
 *   - "See @../reponame/CLAUDE.md for ..."
 * Resolves relative references against the current repo's org.
 */
function detectRelatedRepos(claudeMdContent: string, currentOrg: string): string[] {
  const repos = new Set<string>();

  // Match patterns like "../reponame/" or "../reponame/CLAUDE.md"
  const patterns = [
    /See\s+@\.\.\/([a-zA-Z0-9_-]+)\//gi,
    /source\s+in\s+[`"']?\.\.\/([a-zA-Z0-9_-]+)\/?[`"']?/gi,
    /\(in\s+`\.\.\/([a-zA-Z0-9_-]+)\/`\)/gi,
    /separate\s+repo.*?[`"']?\.\.\/([a-zA-Z0-9_-]+)\/?[`"']?/gi,
    /are\s+in\s+[`"']?\.\.\/([a-zA-Z0-9_-]+)\//gi,
    /[`"']\.\.\/([a-zA-Z0-9_-]+)\/[^`"']*[`"']/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(claudeMdContent)) !== null) {
      repos.add(`${currentOrg}/${match[1]}`);
    }
  }

  return [...repos];
}

/**
 * Get the current repo's org/owner from GITHUB_REPOSITORY env var.
 */
function getCurrentOrg(): string | null {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) return null;
  const parts = repo.split('/');
  return parts.length >= 2 ? parts[0] : null;
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
export function loadArchitectureContext(repoRoot?: string): ArchitectureContext {
  const root = repoRoot || process.cwd();
  const contextParts: string[] = [];
  let config = { ...DEFAULT_CONFIG };

  // Load .reviewpal.yml (optional)
  const configPath = join(root, '.reviewpal.yml');
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      const parsed = yaml.load(raw) as Record<string, unknown>;
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
    } catch {
      // Ignore invalid yaml
    }
  }

  // Load lessons file (.reviewpal-lessons.md)
  let lessonsContext = '';
  const lessonsPath = join(root, '.reviewpal-lessons.md');
  if (existsSync(lessonsPath)) {
    const content = readFileSync(lessonsPath, 'utf-8');
    lessonsContext = truncateAtSectionBoundary(content, 3000);
  }

  // Load local CLAUDE.md
  let claudeMdContent = '';
  const claudeMdPath = join(root, 'CLAUDE.md');
  if (existsSync(claudeMdPath)) {
    claudeMdContent = readFileSync(claudeMdPath, 'utf-8');
    const truncated = truncateAtSectionBoundary(claudeMdContent, MAX_CONTEXT_CHARS);
    contextParts.push(`## Project Architecture (from CLAUDE.md)\n\n${truncated}`);
  }

  // Collect related repos: explicit config + auto-detected from CLAUDE.md
  const relatedRepos = new Set(config.related_repos);
  const currentOrg = getCurrentOrg();
  if (claudeMdContent && currentOrg) {
    const detected = detectRelatedRepos(claudeMdContent, currentOrg);
    for (const repo of detected) {
      relatedRepos.add(repo);
    }
    if (detected.length > 0) {
      process.stderr.write(`[reviewpal] Auto-detected related repos from CLAUDE.md: ${detected.join(', ')}\n`);
    }
  }

  // Fetch CLAUDE.md from each related repo
  const relatedReposLoaded: string[] = [];
  for (const repoRef of relatedRepos) {
    const parts = repoRef.split('/');
    if (parts.length !== 2) continue;
    const [owner, repo] = parts;
    const content = fetchGitHubFile(owner, repo, 'CLAUDE.md');
    if (content) {
      const truncated = truncateAtSectionBoundary(content, 2000);
      contextParts.push(`## Related repo: ${owner}/${repo} (from CLAUDE.md)\n\n${truncated}`);
      relatedReposLoaded.push(`${owner}/${repo}`);
      process.stderr.write(`[reviewpal] Loaded CLAUDE.md from ${owner}/${repo} (${truncated.length} chars)\n`);
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
    } else {
      const filePath = join(root, contextFile);
      if (existsSync(filePath)) {
        try {
          const content = readFileSync(filePath, 'utf-8');
          const truncated = truncateAtSectionBoundary(content, 2000);
          contextParts.push(`## Context from ${contextFile}\n\n${truncated}`);
        } catch {
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
    relatedReposLoaded,
  };
}

/**
 * Truncate text at the nearest section boundary (## heading) before maxChars
 */
function truncateAtSectionBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

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

function asStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((item): item is string => typeof item === 'string');
}
