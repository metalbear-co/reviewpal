# 📦 ReviewPal Installation Guide

Complete step-by-step instructions to install ReviewPal on your GitHub repository.

---

## Prerequisites

- GitHub account
- A repository where you want ReviewPal
- 5 minutes

---

## Step 1️⃣: Get Your Anthropic API Key

### 1. Go to Anthropic Console
Visit: **https://console.anthropic.com**

### 2. Sign Up or Log In
- If you don't have an account, create one
- It's free to sign up

### 3. Navigate to API Keys
- Click on **"API Keys"** in the sidebar
- Or click **"Get API Keys"** button

### 4. Create a New Key
- Click **"Create Key"** button
- Give it a name (e.g., "ReviewPal GitHub Action")
- Click **"Create Key"**

### 5. Copy Your Key
- Your key starts with `sk-ant-`
- **Copy it immediately** - you can't see it again!
- Store it somewhere safe temporarily

> 🔒 **Security Note:** Never share this key or commit it to your repository!

---

## Step 2️⃣: Add API Key to GitHub Secrets

### 1. Go to Your Repository
Navigate to: `https://github.com/YOUR_USERNAME/YOUR_REPO`

### 2. Open Settings
- Click the **"Settings"** tab (top right of your repo)
- If you don't see Settings, you might not have admin access

### 3. Navigate to Secrets
- In the left sidebar, scroll down to **"Secrets and variables"**
- Click to expand it
- Click **"Actions"**

### 4. Add New Secret
- Click the green **"New repository secret"** button

### 5. Configure the Secret
- **Name:** `ANTHROPIC_API_KEY` (must be exactly this)
- **Secret:** Paste your API key from Step 1
- Click **"Add secret"**

✅ **Done!** Your API key is now securely stored.

---

## Step 3️⃣: Add ReviewPal Workflow

You have two options: **Quick (Terminal)** or **Manual (Web UI)**

### Option A: Quick Install via Terminal ⚡

```bash
# 1. Navigate to your repository
cd /path/to/your/repo

# 2. Create workflows directory
mkdir -p .github/workflows

# 3. Download ReviewPal workflow
curl -o .github/workflows/reviewpal.yml \
  https://raw.githubusercontent.com/Arephan/reviewpal/main/examples/github-action-workflow.yml

# 4. Commit and push
git add .github/workflows/reviewpal.yml
git commit -m "Add ReviewPal workflow"
git push
```

**That's it!** Skip to Step 4.

---

### Option B: Manual Setup via GitHub Web UI 🖱️

#### 1. Create Workflow File
- In your repo, click **"Add file"** → **"Create new file"**
- In the file path box, type: `.github/workflows/reviewpal.yml`
  - GitHub will create the folders automatically

#### 2. Paste Workflow Configuration
Copy and paste this entire code block:

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
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: ReviewPal
        uses: Arephan/reviewpal@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

#### 3. Commit the File
- Scroll down to **"Commit new file"**
- Commit message: `Add ReviewPal workflow`
- Choose **"Commit directly to main branch"**
- Click **"Commit new file"**

---

## Step 4️⃣: Test ReviewPal! 🧪

### 1. Create a Test Branch
```bash
git checkout -b test-reviewpal
```

### 2. Make Some Code Changes
Edit any code file in your repo. For example:

```typescript
// src/example.ts
function getUserData(id: number) {
  const response = fetch(`/api/users/${id}`);
  const data = response.json();
  return data;
}
```

### 3. Commit and Push
```bash
git add .
git commit -m "Test ReviewPal functionality"
git push -u origin test-reviewpal
```

### 4. Create a Pull Request
- Go to your repo on GitHub
- You'll see a prompt to **"Compare & pull request"**
- Click it
- Click **"Create pull request"**

### 5. Wait for ReviewPal ⏳
- Go to the **"Checks"** tab on your PR
- You'll see "ReviewPal" running
- Usually takes **30-60 seconds**

### 6. See the Review! 🎉
- ReviewPal will post a comment on your PR
- It will show:
  - Detected language
  - Code summary
  - Issues found (if any)
  - Suggestions to fix them

---

## ✅ Success!

ReviewPal is now installed and will automatically review all future PRs in your repository!

---

## 🎛️ Configuration (Optional)

You can customize ReviewPal by editing `.github/workflows/reviewpal.yml`:

### Analyze Fewer Changes (Faster, Cheaper)
```yaml
- uses: Arephan/reviewpal@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    max_hunks: 10  # Default is 20
```

### Use a Different Model
```yaml
- uses: Arephan/reviewpal@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    model: claude-opus-4-20250514  # More powerful, more expensive
```

### Disable PR Comments (CLI only)
```yaml
- uses: Arephan/reviewpal@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    comment_on_pr: false  # Won't post comments
```

---

## 🆘 Having Issues?

### ReviewPal isn't commenting

**Check:**
1. Go to repo → **Actions** tab → Look for "ReviewPal" runs
2. Click on latest run to see logs
3. Verify `ANTHROPIC_API_KEY` exists in Settings → Secrets
4. Make sure your PR has actual code changes

### "API initialization failed" error

**Fix:**
1. Verify your API key at https://console.anthropic.com
2. Make sure it starts with `sk-ant-`
3. Re-add it to GitHub Secrets
4. Close and reopen your PR

### Need more help?

- 📖 Read the [full README](https://github.com/Arephan/reviewpal)
- 🐛 [Open an issue](https://github.com/Arephan/reviewpal/issues)
- 💬 Check existing [discussions](https://github.com/Arephan/reviewpal/discussions)

---

## 💰 Cost Information

ReviewPal uses Claude Sonnet 4 (~$3 per million tokens).

**Typical costs:**
- Small PR (100 lines): ~$0.01
- Medium PR (500 lines): ~$0.05
- Large PR (2000 lines): ~$0.20

**Control costs:**
- Set `max_hunks: 10` for large repos
- Anthropic gives free credits for new accounts

---

## 🔄 Updating ReviewPal

ReviewPal auto-updates when you use `@v1` in your workflow.

**To update immediately:**
1. Make a new commit (any change)
2. Push it
3. The next PR will use the latest version

**To use a specific version:**
```yaml
- uses: Arephan/reviewpal@v1.1.0  # Locked to 1.1.0
```

---

**That's everything!** Enjoy automated code reviews with ReviewPal. 🎉
