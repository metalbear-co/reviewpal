/**
 * Cross-repo context fetching pipeline.
 * After triage, asks the LLM what code from related repos it needs to see,
 * then searches and fetches that code via GitHub API.
 */
import { GoogleGenAI } from '@google/genai';
import { DiffFile, TriageResult } from '../types.js';
/**
 * Given the triage result and diff, ask the LLM what code from related repos
 * it needs to see, then fetch that code.
 */
export declare function fetchCrossRepoContext(client: GoogleGenAI, files: DiffFile[], triageResult: TriageResult, relatedRepos: string[], model: string): Promise<string>;
//# sourceMappingURL=cross-repo-context.d.ts.map