/**
 * Architecture context loading for ReviewPal
 * Reads CLAUDE.md and optionally .reviewpal.yml for config.
 * Fetches CLAUDE.md from related repos via GitHub API.
 */
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
/**
 * Fetch a file from another GitHub repo using the gh CLI.
 * Optionally specify a branch/ref to fetch from (defaults to default branch).
 * Requires GITHUB_TOKEN or gh auth to have access to the target repo.
 */
export declare function fetchGitHubFile(owner: string, repo: string, filePath: string, ref?: string): string | null;
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
export declare function loadArchitectureContext(repoRoot?: string): ArchitectureContext;
//# sourceMappingURL=context.d.ts.map