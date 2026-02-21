/**
 * Google Gemini API client
 */

import { GoogleGenAI } from '@google/genai';

/**
 * Create a Gemini client
 */
export function createGeminiClient(apiKey?: string): GoogleGenAI {
  const key = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY environment variable required');
  }
  return new GoogleGenAI({ apiKey: key });
}
