/**
 * Core types for AI PR Helper
 */
// Language complexity weights for read time estimation
export const LANGUAGE_COMPLEXITY = {
    // Lower = easier to read
    'js': 1.0,
    'jsx': 1.0,
    'ts': 1.1,
    'tsx': 1.1,
    'json': 0.5,
    'md': 0.3,
    'yaml': 0.6,
    'yml': 0.6,
    'css': 0.7,
    'scss': 0.8,
    'html': 0.6,
    // Higher = harder to read
    'rs': 1.5,
    'go': 1.2,
    'py': 1.0,
    'rb': 1.0,
    'java': 1.3,
    'kt': 1.2,
    'swift': 1.2,
    'c': 1.6,
    'cpp': 1.7,
    'h': 1.5,
    'hpp': 1.6,
};
// Default complexity for unknown languages
export const DEFAULT_COMPLEXITY = 1.0;
// Base reading speed (lines per minute for average code)
export const BASE_READING_SPEED = 50;
