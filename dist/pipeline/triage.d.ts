/**
 * Triage pipeline: Phase A
 * One Gemini call to summarize all changes and identify high-priority files
 */
import { GoogleGenAI } from '@google/genai';
import { DiffFile, TriageResult } from '../types.js';
import { ReviewPalConfig } from './context.js';
/**
 * Build a condensed summary of all changed files for the triage call.
 * Includes filename, +/- stats, and first few lines of each hunk.
 */
export declare function buildTriageSummary(files: DiffFile[]): string;
/**
 * Run the triage phase: one Gemini call that sees all changes condensed.
 * Returns: PR summary, themes, high-priority files, cross-system implications.
 */
export declare function triagePR(client: GoogleGenAI, files: DiffFile[], architectureContext: string, config: ReviewPalConfig, model: string): Promise<TriageResult>;
//# sourceMappingURL=triage.d.ts.map