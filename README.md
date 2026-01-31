# 🔍 ReviewPal

**Help humans review AI-generated code faster.**

> Traditional code review tools find bugs. This one helps you **understand** the code faster.

## ⏱️ Quick Start (5 minutes)

1. **Copy the workflow file** to your repo:

```bash
mkdir -p .github/workflows
curl -o .github/workflows/ai-review.yml \
  https://raw.githubusercontent.com/Arephan/reviewpal/main/examples/github-action-workflow.yml
```

2. **That's it!** The action runs on every PR with zero configuration needed.

**Optional:** Add your Anthropic API key to enable AI-powered summaries:
- Go to repo Settings → Secrets → Actions
- Add `ANTHROPIC_API_KEY` with your key

---

## What It Does

### Without API Key (Free, Static Analysis)
- ✅ **Complexity scoring** - Identifies hard-to-review code
- ✅ **React patterns** - Catches common React anti-patterns
- ✅ **AI-isms detection** - Spots patterns common in AI-generated code
- ✅ **Friendly suggestions** - Actionable fixes, not just complaints

### With API Key (Claude-powered)
- ✅ Everything above, plus:
- 📋 **What Changed & Why** - Summaries for each code change
- 🔮 **Intent Analysis** - What was the AI likely trying to do?

---

## Example Output

```markdown
## 🔍 ReviewPal

### 📄 `src/components/UserProfile.tsx`

<details>
<summary>Lines 15-87</summary>

**🔮 I noticed some AI-isms:**

**excessive-try-catch**
13 try-catch blocks detected. AI tends to over-wrap code in error handlers.

💡 *Simpler approach:* Use a single try-catch at the operation boundary.

---

Hey! 👋 This could use some attention:

```
fetchUsers()
├─ try
  ├─ try
    ├─ try ← 4 levels deep!
  ... +8 more nested blocks
```

**What's going on:**
7 levels of nesting makes it hard to follow the logic.

**Quick wins:**

```typescript
// Instead of 5+ nested try-catches, use one:
try {
  const response = await fetch(url);
  const data = await response.json();
  setState(data);
} catch (error) {
  setError(error?.message ?? 'Unknown error');
}
```

**Why this matters:**
Simpler code = faster reviews = fewer bugs slipping through.

</details>
```

---

## Installation

### GitHub Action (Recommended)

```yaml
name: AI Code Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: ReviewPal
        uses: Arephan/reviewpal@v1
        with:
          # Optional: enables AI summaries
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### CLI

```bash
npm install -g reviewpal

# Review staged changes
reviewpal

# Review a git range
reviewpal --git HEAD~3..HEAD

# Pipe from git
git diff main..feature | reviewpal -
```

---

## Configuration

### Action Inputs

| Input | Description | Default |
|-------|-------------|---------|
| `anthropic_api_key` | Enables AI summaries | - |
| `max_hunks` | Max code blocks to analyze | 20 |
| `skip_summary` | Skip AI summaries | false |
| `skip_patterns` | Skip pattern detection | false |
| `skip_complexity` | Skip complexity scoring | false |
| `comment_on_pr` | Post as PR comment | true |
| `fail_on_high_complexity` | Fail if complexity > 7 | false |

### CLI Options

```bash
reviewpal --help

Options:
  -g, --git <range>     Git diff range (e.g., HEAD~3..HEAD)
  -f, --format <type>   Output: friendly, markdown, json, text
  --no-summary          Skip AI summaries (no API needed)
  --no-patterns         Skip pattern detection
  --no-complexity       Skip complexity analysis
  -m, --max-hunks <n>   Max hunks to analyze (default: 20)
  --model <name>        Claude model (default: claude-sonnet-4-20250514)
  -q, --quiet           Minimal output
```

---

## What It Catches

### React-Specific Patterns (No API Needed)

| Pattern | Issue | Suggestion |
|---------|-------|------------|
| `excessive-try-catch` | AI wraps everything in try-catch | Use single try-catch + error boundaries |
| `too-many-states` | 5+ useState hooks | Use useReducer or group related state |
| `boolean-state-overload` | Many boolean flags | Use a single status enum |
| `useEffect-cleanup` | Missing cleanup | Return cleanup function |
| `memo-inline-object` | Inline objects break memo | Move styles outside component |
| `excessive-console` | Debug logs left in | Remove or use proper logging |

### Complexity Metrics

| Metric | Threshold | Why It Matters |
|--------|-----------|----------------|
| Nesting Depth | > 3 | Hard to follow logic flow |
| Cyclomatic Complexity | > 10 | Too many code paths |
| Parameters | > 4 | Hard to remember arguments |
| Line Count | > 50 | Can't see whole function |
| Dependencies | > 10 | Too many responsibilities |

---

## How It Works

1. **Parse** the git diff into individual code hunks
2. **Analyze** each hunk:
   - Static analysis for complexity (instant, no API)
   - React pattern detection (instant, no API)
   - Claude API for summaries (optional, needs key)
3. **Format** results as friendly PR comments

---

## Why This Exists

Based on research of 1000+ developer complaints, the #1 issue with AI-generated code isn't bugs — it's **comprehension time**.

AI code tends to be:
- Over-defensive (try-catch everywhere)
- Over-verbose (comments explaining obvious things)
- Over-engineered (abstractions that don't help)

This tool helps reviewers:
- Quickly identify areas that need attention
- Understand what the code is trying to do
- Get concrete suggestions, not vague advice

---

## Development

```bash
# Clone
git clone https://github.com/Arephan/reviewpal
cd reviewpal

# Install
npm install

# Build
npm run build

# Test locally
node dist/index.js --git HEAD~1

# Run tests
npm test
```

---

## Contributing

PRs welcome! Please:
1. Keep suggestions actionable (not "consider...")
2. Maintain the friendly tone
3. Add tests for new patterns

---

## License

MIT

---

**Made to help humans review faster, not to replace human judgment.**
