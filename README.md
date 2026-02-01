# 🔍 ReviewPal

**AI-powered code review for any language.**

> Let Claude review your code changes and catch issues before your teammates do.

## ⏱️ Installation (Step-by-Step)

> 📖 **Detailed Guide:** See [INSTALL.md](INSTALL.md) for a complete installation guide with troubleshooting.

### Step 1: Get Your Anthropic API Key

1. Go to https://console.anthropic.com
2. Sign up or log in
3. Click **"Get API Keys"**
4. Click **"Create Key"**
5. Copy the key (starts with `sk-ant-...`)

> 💡 **Tip:** Keep this key secret! Don't commit it to your repo.

---

### Step 2: Add API Key to Your GitHub Repo

1. Go to your GitHub repo (e.g., `github.com/yourname/yourrepo`)
2. Click **Settings** (top right)
3. In the left sidebar, click **Secrets and variables** → **Actions**
4. Click **"New repository secret"**
5. Name: `ANTHROPIC_API_KEY`
6. Value: Paste your API key from Step 1
7. Click **"Add secret"**

✅ Your API key is now securely stored!

---

### Step 3: Add ReviewPal Workflow to Your Repo

**Option A: Quick Install (Terminal)**

```bash
# Navigate to your repo
cd your-repo

# Create workflow directory
mkdir -p .github/workflows

# Download ReviewPal workflow
curl -o .github/workflows/reviewpal.yml \
  https://raw.githubusercontent.com/Arephan/reviewpal/main/examples/github-action-workflow.yml

# Commit and push
git add .github/workflows/reviewpal.yml
git commit -m "Add ReviewPal workflow"
git push
```

**Option B: Manual Setup (GitHub Web UI)**

1. In your repo, click **"Add file"** → **"Create new file"**
2. File path: `.github/workflows/reviewpal.yml`
3. Paste this content:

```yaml
name: ReviewPal
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
      
      - uses: Arephan/reviewpal@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

4. Click **"Commit changes"**

---

### Step 4: Test It!

1. Create a new branch: `git checkout -b test-reviewpal`
2. Make some code changes
3. Commit and push: `git push -u origin test-reviewpal`
4. Create a Pull Request on GitHub
5. Wait ~30-60 seconds
6. **ReviewPal will comment on your PR!** 🎉

---

## ✅ That's It!

ReviewPal will now automatically review every PR in your repo.

**Need help?** [Open an issue](https://github.com/Arephan/reviewpal/issues)

---

## What It Does

ReviewPal uses Claude AI to:
- ✅ **Detect the language** automatically (Python, JS, Go, Rust, Java, etc.)
- ✅ **Find code quality issues** - bugs, anti-patterns, security concerns
- ✅ **Spot AI-generated patterns** - over-defensive code, verbose comments, over-abstraction
- ✅ **Give actionable suggestions** - specific fixes, not vague advice

**Language agnostic** - works with any programming language!

---

## Example Output

```markdown
## 🔍 ReviewPal

### 📄 `src/api/users.ts`

<details>
<summary>Lines 45-89</summary>

**Language:** TypeScript

**Summary:** Added user authentication with token validation and error handling.

**Issues Found:**

🟡 **Excessive try-catch nesting (4 levels deep)**
💡 *Fix:* Use a single try-catch at the function boundary. Let errors bubble up naturally.

🟡 **Missing input validation before database query**
💡 *Fix:* Add schema validation using zod or joi before the database call.

🟢 **Consider using a constant for the token expiry time**
💡 *Fix:* Move magic number 3600 to a named constant: TOKEN_EXPIRY_SECONDS

</details>
```

---

## Installation

### GitHub Action (Recommended)

```yaml
name: ReviewPal
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
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### CLI

```bash
npm install -g reviewpal

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...

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
| `anthropic_api_key` | **Required** - Your Anthropic API key | - |
| `max_hunks` | Max code blocks to analyze | 20 |
| `model` | Claude model to use | claude-sonnet-4-20250514 |
| `comment_on_pr` | Post as PR comment | true |

### CLI Options

```bash
reviewpal --help

Options:
  -g, --git <range>     Git diff range (e.g., HEAD~3..HEAD)
  -f, --format <type>   Output: friendly, json
  -m, --max-hunks <n>   Max hunks to analyze (default: 20)
  --model <name>        Claude model (default: claude-sonnet-4-20250514)
  -q, --quiet           Minimal output
```

---

## Supported Languages

**All of them!** 🌍

ReviewPal uses Claude AI to understand any programming language:
- JavaScript, TypeScript, Python, Java, Go, Rust, C++, C#, Ruby, PHP, Kotlin, Swift...
- Even SQL, YAML, Dockerfile, shell scripts, and more

Claude automatically detects the language and applies appropriate review standards.

---

## How It Works

1. **Parse** the git diff into code changes
2. **Send to Claude** with context about the file and change
3. **AI analyzes** for:
   - Language detection
   - Code quality issues
   - AI-generated patterns
   - Improvement opportunities
4. **Format** results as friendly PR comments

---

## Why ReviewPal?

**Problem:** AI-generated code is hard to review
- Over-defensive (try-catch everywhere)
- Over-verbose (obvious comments)
- Over-engineered (unnecessary abstractions)

**Solution:** Let AI review AI-generated code
- Catches patterns humans miss
- Works with any language
- Gives specific, actionable feedback
- Fast and consistent

---

## 🔧 Troubleshooting

### ReviewPal isn't commenting on my PRs

**Check 1: Is the workflow running?**
- Go to your repo → **Actions** tab
- Look for "ReviewPal" workflow runs
- Click on the latest run to see logs

**Check 2: Is the API key set correctly?**
- Go to repo **Settings** → **Secrets and variables** → **Actions**
- Verify `ANTHROPIC_API_KEY` exists
- If not, add it (see Step 2 above)

**Check 3: Does the workflow file exist?**
- Look for `.github/workflows/reviewpal.yml` in your repo
- If missing, add it (see Step 3 above)

**Check 4: Are there code changes in the PR?**
- ReviewPal only analyzes files with code changes
- Empty PRs or README-only changes won't trigger a review

---

### Error: "API initialization failed"

This means the API key is missing or invalid.

**Fix:**
1. Verify your API key at https://console.anthropic.com
2. Make sure it starts with `sk-ant-`
3. Re-add it to GitHub Secrets (Settings → Secrets → Actions)
4. Close and reopen your PR to trigger a new run

---

### ReviewPal is too slow

**Normal timing:**
- Small PR (< 200 lines): 30-60 seconds
- Medium PR (500 lines): 1-2 minutes
- Large PR (1000+ lines): 2-5 minutes

**If it's slower:**
- Check GitHub Actions status page (status.github.com)
- Check Anthropic API status (status.anthropic.com)
- Reduce `max_hunks` in the workflow to speed it up

---

### How do I update to the latest version?

Just change `@v1` to `@v1.1.0` (or latest) in your workflow file:

```yaml
- uses: Arephan/reviewpal@v1.1.0  # specific version
# or
- uses: Arephan/reviewpal@v1      # auto-updates to latest v1.x
```

**Recommendation:** Use `@v1` to get automatic updates.

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
export ANTHROPIC_API_KEY=sk-ant-...
node dist/index.js --git HEAD~1
```

---

## API Key Safety

Your `ANTHROPIC_API_KEY` is:
- ✅ Stored in GitHub Secrets (encrypted)
- ✅ Only accessible to your workflows
- ✅ Never logged or exposed in output
- ✅ Can be rotated anytime at console.anthropic.com

---

## Cost

ReviewPal uses Claude Sonnet 4 by default (~$3 per million tokens).

**Typical usage:**
- Small PR (100 lines): ~$0.01
- Medium PR (500 lines): ~$0.05  
- Large PR (2000 lines): ~$0.20

Set `max_hunks` to control costs on massive PRs.

---

## Contributing

PRs welcome! Keep it:
1. Language agnostic
2. Actionable (not vague)
3. Friendly in tone

---

## License

MIT

---

**Made with Claude, for reviewing code written by Claude.** 🤖
