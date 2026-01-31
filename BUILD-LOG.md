# BUILD-LOG.md

## 2024-01-XX: Inline Diff Comments Redesign

### Overview
Rebuilt AI PR Helper v2 analyzer to post inline diff comments instead of accordion summaries. This provides more targeted, actionable feedback directly on the relevant code lines.

### Changes Made

#### 1. New Type System (`src/types.ts`)
- Added `Severity` type: `'explanation' | 'warning' | 'bug' | 'security' | 'suggestion'`
- Added `InlineComment` interface with:
  - `file`: string - filename
  - `line`: number - line number in diff
  - `body`: string - formatted comment body
  - `severity`: Severity - categorization
  - `title`: string - short title
- Added `InlineAnalysis` interface replacing summary format:
  - `comments`: InlineComment[]
  - `estimatedReadTimeMinutes`: number

#### 2. Analyzer Rewrite (`src/analyzer.ts`)
**New Functions:**
- `analyzeInline()` - Main analysis function that:
  - Parses diff hunks to extract available line numbers
  - Sends diffs to Claude with severity system instructions
  - Returns structured inline comments
  - Each comment follows format:
    ```
    {emoji} **{Title}**
    
    **What:** {brief description}
    **Why:** {reason for flag}
    **Action:** {what reviewer should do}
    ```

- `parseDiffLineNumbers()` - Utility to extract commentable line numbers from patch diffs
  - Parses hunk headers (`@@ -old +new @@`)
  - Tracks added/modified lines (starts with `+`)
  - Returns array of valid line numbers

- `formatIndexComment()` - Creates navigation index for top-level comment:
  - Groups comments by severity
  - Shows location for each comment
  - Displays count and estimated read time
  - Orders by priority: security → bug → warning → suggestion → explanation

- `getEmojiForSeverity()` - Maps severity to emoji:
  - 📖 explanation
  - ⚠️ warning
  - 🐛 bug
  - 🔒 security
  - 🎨 suggestion

**Kept Legacy:**
- `analyzePR()` - Original accordion format (for backward compatibility)
- `formatSummaryComment()` - Original summary formatter

#### 3. GitHub Client Updates (`src/github.ts`)
**New Methods:**
- `postReviewComment()` - Posts single review comment on specific diff line
  - Uses `/repos/{owner}/{repo}/pulls/{pr}/comments` endpoint
  - Requires: commit_id, path, line, body

- `postReviewComments()` - Batch posts multiple review comments
  - Error handling: continues on failure, logs errors
  - Returns array of successfully posted comment IDs

- `getPRHeadSha()` - Gets HEAD commit SHA for a PR
  - Required for posting review comments

#### 4. Main Entry Point (`src/index.ts`)
**Updated `handleReadyPR()`:**
1. Size estimation (unchanged)
2. **NEW:** Generate inline analysis via `analyzeInline()`
3. **NEW:** Get HEAD commit SHA
4. **NEW:** Post review comments to specific diff lines
5. **NEW:** Create index comment with navigation
6. Remove old accordion summary posting

**Constants Added:**
- `BOT_IDENTIFIER_INDEX = 'ai-pr-helper:inline-index'`

### Severity System

| Emoji | Severity | Use Case |
|-------|----------|----------|
| 📖 | explanation | Context/what this does (informational) |
| ⚠️ | warning | Needs review, potential issue |
| 🐛 | bug | Logic error, edge case |
| 🔒 | security | Auth, XSS, injection risks |
| 🎨 | suggestion | Optional improvement |

### Comment Format

Each inline comment follows this structure:

```markdown
{emoji} **{Title}**

**What:** {brief description}
**Why:** {reason for flag}
**Action:** {what reviewer should do}
```

### Index Comment Format

Top-level comment with navigation:

```markdown
## 📋 Quick Navigation

Found X items for review (~Y min read)

### 🔒 Security
1. **Token exposure** → `src/auth.ts:45`

### 🐛 Bug
2. **Null reference risk** → `src/api.ts:67`

### ⚠️ Warning
3. **Missing validation** → `src/handlers.ts:123`
```

### Testing

Build successful:
```bash
npm run typecheck  # ✓ No errors
npm run build      # ✓ Compiled successfully
npm test           # ✓ All 15 tests passing
```

#### Manual Testing Script

Created `test-inline.ts` for local testing:

```bash
# Test locally before deploying
GITHUB_TOKEN=xxx ANTHROPIC_API_KEY=xxx npx tsx test-inline.ts
```

This script:
1. Fetches PR #1 from `Arephan/ai-pr-helper-test`
2. Runs inline analysis
3. Displays generated comments
4. Shows the index comment

#### Deployment to Test Repo

To test on `Arephan/ai-pr-helper-test` PR #1:

1. **Push changes:**
   ```bash
   cd /Users/hankim/clawd/ai-pr-helper-v2
   git add .
   git commit -m "feat: inline diff comments with severity system"
   git push origin main
   ```

2. **Trigger workflow:**
   - Option A: Re-push to PR #1 to trigger `synchronize` event
   - Option B: Convert PR #1 to draft and back to ready
   - Option C: Manually trigger workflow via GitHub Actions UI

3. **Expected results:**
   - Multiple inline review comments on specific lines
   - Top-level index comment with navigation
   - Comments categorized by severity (security, bug, warning, suggestion, explanation)
   - Each comment follows the What/Why/Action format

#### Test Verification Checklist

- [ ] Inline comments posted on specific diff lines
- [ ] Comments use correct emoji for severity
- [ ] Comment body follows format: What/Why/Action
- [ ] Index comment shows grouped navigation
- [ ] Index comment displays counts and read time
- [ ] Comments are helpful and actionable
- [ ] No duplicate or redundant comments
- [ ] Line numbers are accurate

Ready for testing on: `Arephan/ai-pr-helper-test` PR #1

### Migration Notes

- Old `analyzePR()` and `formatSummaryComment()` kept for backward compatibility
- New workflow uses `analyzeInline()` and `formatIndexComment()`
- Draft PRs still use size estimation only
- Ready PRs now get inline comments instead of accordion summaries

### Technical Details

**Diff Line Parsing:**
- Parses unified diff format (`@@ -old,count +new,count @@`)
- Tracks line numbers for additions (`+` prefix)
- Skips deletions (`-` prefix) and file markers (`+++`/`---`)

**Claude Prompt Design:**
- System prompt: Senior code reviewer persona
- User prompt: Includes available line numbers per file
- Response format: Structured JSON with comments array
- Constraint: Line numbers must match available lines from diff parsing

**Error Handling:**
- Review comment posting continues on individual failures
- Errors logged but don't block other comments
- Index comment always posted with successful results

### Future Enhancements

Potential improvements:
- [ ] Direct links from index to review comments (GitHub limitation)
- [ ] Diff-aware comment positioning for multi-line hunks
- [ ] Comment threading for related issues
- [ ] AI-powered comment resolution suggestions
- [ ] Severity-based auto-labeling
