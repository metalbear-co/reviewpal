import { formatFriendlyReviewResult } from '../src/formatters/friendly';
import { ReviewResult } from '../src/types';

function makeResult(overrides: Partial<ReviewResult> = {}): ReviewResult {
  return {
    files: [],
    totalHunks: 0,
    totalProcessingTime: 0,
    aiCodeLikelihood: 'low',
    ...overrides,
  };
}

describe('formatFriendlyReviewResult', () => {
  it('returns "Looks good" for empty results', () => {
    const result = makeResult();
    expect(formatFriendlyReviewResult(result)).toContain('Looks good');
  });

  it('returns "Looks good" for files with no hunks', () => {
    const result = makeResult({
      files: [{ filename: 'a.ts', hunks: [], overallComplexity: 0 }],
    });
    expect(formatFriendlyReviewResult(result)).toContain('Looks good');
  });

  it('shows summary when AI review has no critical issues', () => {
    const result = makeResult({
      files: [{
        filename: 'a.ts',
        hunks: [{
          hunk: {
            filename: 'a.ts',
            startLine: 1,
            endLine: 10,
            content: '',
            additions: [],
            deletions: [],
            context: '',
          },
          aiReview: {
            summary: 'Adds a utility function',
            critical: [],
            language: 'TypeScript',
          },
          processingTime: 100,
        }],
        overallComplexity: 1,
      }],
    });

    const output = formatFriendlyReviewResult(result);
    expect(output).toContain('Adds a utility function');
    expect(output).toContain('TypeScript');
    expect(output).toContain('No critical issues found');
  });

  it('shows critical issues with emoji markers', () => {
    const result = makeResult({
      files: [{
        filename: 'a.ts',
        hunks: [{
          hunk: {
            filename: 'a.ts',
            fileDiffHash: 'abc123',
            startLine: 1,
            endLine: 10,
            content: '',
            additions: [],
            deletions: [],
            context: '',
          },
          aiReview: {
            summary: 'Updates auth logic',
            critical: [
              {
                type: 'security',
                line: 5,
                issue: 'SQL injection risk',
                friendlySuggestion: 'Use parameterized queries',
              },
              {
                type: 'crash',
                line: 12,
                issue: 'Null reference',
                friendlySuggestion: 'Add null check',
              },
            ],
            language: 'TypeScript',
          },
          processingTime: 100,
        }],
        overallComplexity: 5,
      }],
    });

    const output = formatFriendlyReviewResult(result);
    expect(output).toContain('Critical Issues');
    expect(output).toContain('SECURITY');
    expect(output).toContain('SQL injection risk');
    expect(output).toContain('CRASH');
    expect(output).toContain('Null reference');
  });

  it('generates GitHub links when env vars are set', () => {
    const origRepo = process.env.GITHUB_REPOSITORY;
    const origPR = process.env.PR_NUMBER;
    process.env.GITHUB_REPOSITORY = 'owner/repo';
    process.env.PR_NUMBER = '42';

    try {
      const result = makeResult({
        files: [{
          filename: 'a.ts',
          hunks: [{
            hunk: {
              filename: 'a.ts',
              fileDiffHash: 'abc123',
              startLine: 1,
              endLine: 10,
              content: '',
              additions: [],
              deletions: [],
              context: '',
            },
            aiReview: {
              summary: 'Fix bug',
              critical: [{
                type: 'performance',
                line: 8,
                issue: 'N+1 query',
                friendlySuggestion: 'Batch the query',
              }],
              language: 'TypeScript',
            },
            processingTime: 50,
          }],
          overallComplexity: 3,
        }],
      });

      const output = formatFriendlyReviewResult(result);
      expect(output).toContain('https://github.com/owner/repo/pull/42/files#diff-abc123R8');
    } finally {
      process.env.GITHUB_REPOSITORY = origRepo;
      process.env.PR_NUMBER = origPR;
    }
  });
});
