/**
 * Cross-repo context fetching pipeline.
 * After triage, asks the LLM what code from related repos it needs to see,
 * then searches and fetches that code via GitHub API.
 */

import { GoogleGenAI } from '@google/genai';
import { execSync } from 'child_process';
import { DiffFile, TriageResult } from '../types.js';
import { fetchGitHubFile } from './context.js';
import { buildTriageSummary } from './triage.js';

interface CrossRepoFile {
  repo: string;
  path: string;
  reason: string;
  content: string;
}

/**
 * Search a GitHub repo for code matching a query.
 * Returns file paths that match.
 */
function searchRepoCode(owner: string, repo: string, query: string): string[] {
  try {
    // GitHub code search API: search within a specific repo
    const escapedQuery = query.replace(/"/g, '\\"');
    const result = execSync(
      `gh api "search/code?q=${encodeURIComponent(escapedQuery)}+repo:${owner}/${repo}&per_page=5" --jq '.items[].path' 2>/dev/null`,
      { encoding: 'utf-8', timeout: 15000 }
    ).trim();

    if (!result) return [];
    return result.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Given the triage result and diff, ask the LLM what code from related repos
 * it needs to see, then fetch that code.
 */
export async function fetchCrossRepoContext(
  client: GoogleGenAI,
  files: DiffFile[],
  triageResult: TriageResult,
  relatedRepos: string[],
  model: string
): Promise<string> {
  if (relatedRepos.length === 0) return '';

  // Build a condensed view of what changed
  const changedFiles = files.map(f => `- ${f.filename} (+${f.additions}/-${f.deletions})`).join('\n');
  const summary = buildTriageSummary(files);

  const repoList = relatedRepos.map(r => `- ${r}`).join('\n');

  const prompt = `You are analyzing a PR to determine if changes in this repo affect code in related repos.

PR SUMMARY: ${triageResult.prSummary}
THEMES: ${triageResult.themes.join(', ')}

CHANGED FILES:
${changedFiles}

KEY CHANGES (condensed diff):
${summary.slice(0, 8000)}

RELATED REPOS (sibling repos in the same org):
${repoList}

Based on the changes in this PR, identify specific files or symbols in the related repos that could be affected by or relevant to understanding these changes. Think about:
- Shared types, interfaces, or protocol definitions used by both repos
- Functions or modules that consume the APIs being modified
- Configuration or schema that must stay in sync
- Test files that verify the contracts being changed

For each file you want to see, provide:
1. Which repo it's in
2. A search query to find it (a specific function name, type name, or keyword)
3. Why seeing this code matters for the review

Respond in JSON:
{
  "searches": [
    {
      "repo": "org/repo",
      "query": "specific function or type name to search for",
      "reason": "why this is relevant to the PR"
    }
  ]
}

Guidelines:
- Only request files that are DIRECTLY relevant to the changes. Not general architecture.
- Max 5 searches. Fewer is better.
- Use specific symbol names from the diff (struct names, function names, trait names) as search queries.
- If the PR changes are purely internal with no cross-repo impact, return an empty searches array.
- An empty array is the expected result for most PRs.`;

  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      maxOutputTokens: 2000,
    },
  });

  const text = response.text || '';

  let searches: Array<{ repo: string; query: string; reason: string }>;
  try {
    const parsed = JSON.parse(text);
    searches = Array.isArray(parsed.searches) ? parsed.searches : [];
  } catch {
    return '';
  }

  if (searches.length === 0) return '';

  process.stderr.write(`[reviewpal] Searching ${searches.length} related repo queries...\n`);

  // Execute searches and fetch files
  const fetchedFiles: CrossRepoFile[] = [];
  const seenPaths = new Set<string>();

  for (const search of searches.slice(0, 5)) {
    const parts = search.repo.split('/');
    if (parts.length !== 2) continue;
    const [owner, repo] = parts;

    // Search for matching files
    const matchingPaths = searchRepoCode(owner, repo, search.query);

    for (const filePath of matchingPaths.slice(0, 2)) {
      const key = `${search.repo}:${filePath}`;
      if (seenPaths.has(key)) continue;
      seenPaths.add(key);

      const content = fetchGitHubFile(owner, repo, filePath);
      if (content) {
        // Truncate large files
        const truncated = content.length > 3000
          ? content.slice(0, 3000) + '\n\n[truncated]'
          : content;

        fetchedFiles.push({
          repo: search.repo,
          path: filePath,
          reason: search.reason,
          content: truncated,
        });

        process.stderr.write(`[reviewpal] Fetched ${search.repo}:${filePath} (${truncated.length} chars) - ${search.reason}\n`);
      }
    }
  }

  if (fetchedFiles.length === 0) return '';

  // Build context string
  const contextParts = fetchedFiles.map(f =>
    `### ${f.repo}:${f.path}\n_Reason: ${f.reason}_\n\`\`\`\n${f.content}\n\`\`\``
  );

  return `## Code from related repos (fetched for cross-repo review)\n\n${contextParts.join('\n\n')}`;
}
