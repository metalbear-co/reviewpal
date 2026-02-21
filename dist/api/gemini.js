"use strict";
/**
 * Google Gemini API client
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGeminiClient = createGeminiClient;
const genai_1 = require("@google/genai");
/**
 * Create a Gemini client
 */
function createGeminiClient(apiKey) {
    const key = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!key) {
        throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY environment variable required');
    }
    return new genai_1.GoogleGenAI({ apiKey: key });
}
//# sourceMappingURL=gemini.js.map