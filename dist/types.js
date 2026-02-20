"use strict";
/**
 * Core types for AI Review Helper
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.DEFAULT_CONFIG = {
    model: 'gemini-2.5-pro',
    complexityThresholds: {
        nestingDepth: 3,
        cyclomaticComplexity: 10,
        parameterCount: 4,
        lineCount: 50,
        dependencyCount: 10
    },
    enabledAnalyzers: {
        summary: true,
        patterns: true,
        complexity: true
    }
};
//# sourceMappingURL=types.js.map