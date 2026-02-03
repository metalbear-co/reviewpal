/**
 * Tests for the ReviewPal reply detection logic from reply/action.yml.
 *
 * The core detection uses the regex /@review-?pal\b/i to decide whether
 * ReviewPal should respond to a comment. This test suite validates that
 * regex and the high-level decision logic extracted from the action.
 */

const MENTION_REGEX = /@review-?pal\b/i;

function shouldReplyToComment(body: string): boolean {
  return MENTION_REGEX.test(body);
}

describe('ReviewPal mention detection', () => {
  describe('should match valid mentions', () => {
    it.each([
      '@review-pal',
      '@reviewpal',
      '@Review-Pal',
      '@ReviewPal',
      '@REVIEW-PAL',
      '@REVIEWPAL',
      'hey @review-pal can you explain?',
      '@review-pal what do you think?',
      'I disagree @reviewpal',
      'cc @review-pal',
    ])('matches: %s', (input) => {
      expect(shouldReplyToComment(input)).toBe(true);
    });
  });

  describe('should not match invalid mentions', () => {
    it.each([
      '',
      'review-pal',
      'reviewpal',
      '@review_pal',
      '@review--pal',
      '@reviewpals',
      '@review-pals',
      'I think this code is fine',
      '@reviewer',
      '@review-paladin',
    ])('does not match: "%s"', (input) => {
      expect(shouldReplyToComment(input)).toBe(false);
    });
  });
});

describe('Reply decision logic', () => {
  function isBotComment(login: string): boolean {
    return login === 'github-actions[bot]';
  }

  describe('bot comment filtering', () => {
    it('skips comments from github-actions[bot]', () => {
      expect(isBotComment('github-actions[bot]')).toBe(true);
    });

    it('does not skip comments from regular users', () => {
      expect(isBotComment('hankim')).toBe(false);
      expect(isBotComment('octocat')).toBe(false);
    });
  });

  describe('review comment reply path', () => {
    interface ReplyScenario {
      parentIsBot: boolean;
      replyBody: string;
      expected: boolean;
    }

    it.each<ReplyScenario>([
      { parentIsBot: true, replyBody: '@review-pal explain this', expected: true },
      { parentIsBot: true, replyBody: '@reviewpal why?', expected: true },
      { parentIsBot: true, replyBody: 'I disagree with this', expected: false },
      { parentIsBot: true, replyBody: '', expected: false },
      { parentIsBot: false, replyBody: '@review-pal help', expected: false },
      { parentIsBot: false, replyBody: 'looks good', expected: false },
    ])('parentIsBot=$parentIsBot body="$replyBody" → $expected', ({ parentIsBot, replyBody, expected }) => {
      const shouldReply = parentIsBot && MENTION_REGEX.test(replyBody);
      expect(shouldReply).toBe(expected);
    });
  });

  describe('new thread path', () => {
    it('responds to new thread with @review-pal mention', () => {
      const body = '@review-pal what does this function do?';
      expect(shouldReplyToComment(body)).toBe(true);
    });

    it('ignores new thread without mention', () => {
      const body = 'This function looks wrong to me';
      expect(shouldReplyToComment(body)).toBe(false);
    });
  });

  describe('issue comment path', () => {
    function shouldReplyToIssueComment(
      hasReviewpalSummary: boolean,
      body: string,
    ): boolean {
      return hasReviewpalSummary && MENTION_REGEX.test(body);
    }

    it('responds when summary exists and user tags @review-pal', () => {
      expect(shouldReplyToIssueComment(true, '@review-pal summarize')).toBe(true);
    });

    it('ignores when summary exists but no mention', () => {
      expect(shouldReplyToIssueComment(true, 'what is this PR about?')).toBe(false);
    });

    it('ignores when no summary exists even with mention', () => {
      expect(shouldReplyToIssueComment(false, '@review-pal help')).toBe(false);
    });
  });

  describe('ReviewPal summary comment detection', () => {
    function isReviewpalSummary(login: string, body: string): boolean {
      return login === 'github-actions[bot]' && body.includes('<!-- reviewpal -->');
    }

    it('detects ReviewPal summary comment', () => {
      expect(isReviewpalSummary('github-actions[bot]', '<!-- reviewpal -->\n## Summary')).toBe(true);
    });

    it('ignores bot comments without marker', () => {
      expect(isReviewpalSummary('github-actions[bot]', 'Just a regular bot comment')).toBe(false);
    });

    it('ignores non-bot comments with marker', () => {
      expect(isReviewpalSummary('hankim', '<!-- reviewpal -->')).toBe(false);
    });
  });
});
