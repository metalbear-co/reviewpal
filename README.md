# 🦞 AI PR Helper

**Stop wasting time on massive PRs.** AI PR Helper catches oversized PRs early, suggests intelligent splits, and helps reviewers navigate complex changes.

## The Problem

AI-generated code produces **massive PRs** (500+ lines). Reviewing them means:
- Endless scrolling
- Cognitive overload
- Missed bugs
- Slow reviews

## The Solution

AI PR Helper uses Claude to:

1. **🚨 Catch size problems early** - Warns in DRAFT state before you mark ready
2. **📦 Suggest smart splits** - Groups by intent, not file type
3. **📋 Create navigable summaries** - Clickable index with details
4. **💬 Answer questions** - Comment "what does this do?" on any line

---

## Quick Start (5 minutes)

### 1. Add the secret

Go to **Settings → Secrets → Actions** and add:
- `ANTHROPIC_API_KEY` - Your Anthropic API key

### 2. Create the workflow

Create `.github/workflows/pr-helper.yml`:

```yaml
name: AI PR Helper

on:
  pull_request:
    types: [opened, synchronize, ready_for_review]
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  analyze:
    runs-on: ubuntu-latest
    if: |
      github.event_name == 'pull_request' ||
      (github.event_name == 'issue_comment' && github.event.issue.pull_request) ||
      github.event_name == 'pull_request_review_comment'

    steps:
      - name: Run AI PR Helper
        uses: clawdbot/ai-pr-helper@v2
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### 3. Done!

That's it. Open a draft PR and watch the magic.

---

## Features

### Feature 1: Early Size Detection

When you open or update a **DRAFT PR**, you'll get:

```
## 🚨 PR Size Check

**850 lines** changed across **15 files**

| Metric | Value |
|--------|-------|
| Additions | +720 |
| Deletions | -130 |
| Est. Read Time | ~17 min |
| Cognitive Load | high |

**Status:** Split before marking Ready for review

---

### 📦 Suggested Splits

#### 1. **Authentication Flow** (~6 min)
Implements OAuth login with Google

**Files:**
- `auth.ts`
- `login.tsx`
- `api/oauth.ts`

**Includes:**
- OAuth implementation
- Token refresh logic
- Logout endpoint

...
```

### Feature 2: Inline Code Review

When you mark a PR **Ready for review**, you get **inline diff comments** directly on the code:

**Index comment (top-level navigation):**

```markdown
## 📋 Quick Navigation

Found 8 items for review (~6 min read)

### 🔒 Security
1. **Token exposure risk** → `src/auth.ts:45`

### 🐛 Bug
2. **Null reference** → `src/api/user.ts:67`
3. **Missing error handling** → `src/utils/fetch.ts:23`

### ⚠️ Warning
4. **Potential performance issue** → `src/components/UserList.tsx:102`
5. **Deprecated API** → `src/hooks/useAuth.ts:34`

### 🎨 Suggestion
6. **Simplify with optional chaining** → `src/utils/format.ts:56`

### 📖 Explanation
7. **React Hook dependencies** → `src/components/Profile.tsx:89`
8. **Why async/await here** → `src/api/client.ts:15`
```

**Inline comments (on specific lines):**

Each comment appears directly on the relevant line in the diff:

```markdown
🔒 **Token exposure risk**

**What:** JWT token is logged in plain text
**Why:** Tokens in logs can be extracted by anyone with log access
**Action:** Remove this console.log or redact the token value
```

```markdown
🐛 **Null reference**

**What:** Accessing user.profile without null check
**Why:** API can return user without profile field causing crash
**Action:** Add optional chaining: user.profile?.name
```

**Severity System:**

| Emoji | Severity | Use Case |
|-------|----------|----------|
| 📖 | explanation | Context/what this does |
| ⚠️ | warning | Needs review, potential issue |
| 🐛 | bug | Logic error, edge case |
| 🔒 | security | Auth, XSS, injection risks |
| 🎨 | suggestion | Optional improvement |

### Feature 3: Interactive Help

Comment on any line with a question:

| You say | Bot replies with |
|---------|-----------------|
| "what does this do?" | Detailed explanation of the code |
| "why this change?" | Context and intent |
| "suggest better approach" | Alternative implementations |
| "show me tests" | Related test files |
| "help" | List of commands |

### Feature 4: Size Labels

PRs automatically get labeled:
- `size:xs` - ≤100 lines (green)
- `size:s` - 101-250 lines (light green)
- `size:m` - 251-500 lines (yellow)
- `size:l` - 501-800 lines (orange)
- `size:xl` - >800 lines (red)

---

## Configuration

| Input | Default | Description |
|-------|---------|-------------|
| `anthropic-api-key` | required | Your Anthropic API key |
| `github-token` | `GITHUB_TOKEN` | GitHub token (auto-provided) |
| `mode` | `auto` | `auto`, `draft-only`, `ready-only`, `interactive-only` |
| `max-lines` | `500` | Line threshold for "too large" |
| `max-read-time` | `10` | Minutes threshold for "too long" |
| `model` | `claude-sonnet-4-20250514` | Claude model to use |

### Modes

- **`auto`** (default) - All features enabled
- **`draft-only`** - Only size checks on draft PRs
- **`ready-only`** - Only summaries when marked ready
- **`interactive-only`** - Only respond to comments

---

## Cost Estimation

Typical API usage per PR:
- Size check (draft): ~2K tokens ($0.006)
- Split suggestions: ~4K tokens ($0.012)
- Full summary: ~8K tokens ($0.024)
- Interactive Q&A: ~1K tokens/question ($0.003)

**Estimated monthly cost:** $5-20 for a team of 5 with ~50 PRs/month

---

## Workflow

```
PR opened (draft)
      ↓
Size Estimator
      ↓
Too large? → Suggest splits
      ↓
User splits PRs
      ↓
Each PR marked "Ready"
      ↓
Intent Analyzer → Summary posted
      ↓
User reviews
      ↓
"what does this?" → Bot explains
      ↓
Review complete ✓
```

---

## Architecture

```
src/
├── index.ts      # Entry point, routes events
├── types.ts      # Type definitions
├── github.ts     # GitHub API client
├── anthropic.ts  # Claude API client
├── estimator.ts  # Size estimation & splits
├── analyzer.ts   # Intent grouping & summaries
├── responder.ts  # Interactive comment handler
└── labels.ts     # Label management
```

---

## Local Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

---

## License

MIT

---

Built with 🦞 by Han Kim
