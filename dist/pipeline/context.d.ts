/**
 * Architecture context loading for ReviewPal
 * Reads CLAUDE.md and .reviewpal.yml to provide project context to AI reviews.
 * Supports cross-repo context via GitHub API (org/repo:path syntax).
 */
export interface ReviewPalConfig {
    skip_patterns: string[];
    review_instructions: string[];
    focus_areas: string[];
    context_files: string[];
    max_api_calls: number;
}
export interface ArchitectureContext {
    architectureContext: string;
    config: ReviewPalConfig;
}
/**
 * Load architecture context from CLAUDE.md and .reviewpal.yml
 */
export declare function loadArchitectureContext(repoRoot?: string): ArchitectureContext;
//# sourceMappingURL=context.d.ts.map