/**
 * Adversarial review pipeline
 * Runs multiple passes with different skeptical personas to catch
 * subtle issues that a single helpful review pass would miss.
 * Personas adapt based on the primary language(s) in the PR.
 *
 * NOTE: This module is no longer called from index.ts (unified-review.ts
 * handles adversarial review inline). Kept for backward compatibility.
 */
import { GoogleGenAI } from '@google/genai';
import { DiffFile, TriageResult, AdversarialFinding } from '../types.js';
import { ReviewPalConfig } from './context.js';
/**
 * Run adversarial review passes on high-priority files.
 * Each persona gets a different adversarial prompt to catch blind spots.
 * The third persona adapts based on the primary language in the PR.
 */
export declare function runAdversarialReview(client: GoogleGenAI, files: DiffFile[], triageResult: TriageResult, architectureContext: string, lessonsContext: string, config: ReviewPalConfig, model: string, maxCalls: number): Promise<AdversarialFinding[]>;
//# sourceMappingURL=adversarial.d.ts.map