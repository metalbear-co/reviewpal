/**
 * Architecture context loading for ReviewPal
 * Reads CLAUDE.md and .reviewpal.yml to provide project context to AI reviews
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

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

const DEFAULT_CONFIG: ReviewPalConfig = {
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
export function loadArchitectureContext(repoRoot?: string): ArchitectureContext {
  const root = repoRoot || process.cwd();
  const contextParts: string[] = [];
  let config = { ...DEFAULT_CONFIG };

  // Load .reviewpal.yml
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
          max_api_calls: typeof parsed.max_api_calls === 'number' ? parsed.max_api_calls : DEFAULT_CONFIG.max_api_calls,
        };
      }
    } catch {
      // Ignore invalid yaml
    }
  }

  // Load CLAUDE.md
  const claudeMdPath = join(root, 'CLAUDE.md');
  if (existsSync(claudeMdPath)) {
    const content = readFileSync(claudeMdPath, 'utf-8');
    const truncated = truncateAtSectionBoundary(content, MAX_CONTEXT_CHARS);
    contextParts.push(`## Project Architecture (from CLAUDE.md)\n\n${truncated}`);
  }

  // Load additional context files from config
  for (const contextFile of config.context_files) {
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
function truncateAtSectionBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

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

function asStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.filter((item): item is string => typeof item === 'string');
}
