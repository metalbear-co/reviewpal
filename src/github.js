/**
 * GitHub API utilities
 */
import * as github from '@actions/github';
export class GitHubClient {
    octokit;
    owner;
    repo;
    constructor(token, owner, repo) {
        this.octokit = github.getOctokit(token);
        this.owner = owner;
        this.repo = repo;
    }
    /**
     * Get full PR data including files
     */
    async getPullRequest(prNumber) {
        const { data: pr } = await this.octokit.rest.pulls.get({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
        });
        const files = await this.getPRFiles(prNumber);
        return {
            number: pr.number,
            title: pr.title,
            body: pr.body,
            draft: pr.draft ?? false,
            state: pr.state,
            additions: pr.additions,
            deletions: pr.deletions,
            changed_files: pr.changed_files,
            files,
            base: {
                ref: pr.base.ref,
                sha: pr.base.sha,
            },
            head: {
                ref: pr.head.ref,
                sha: pr.head.sha,
            },
            user: {
                login: pr.user?.login ?? 'unknown',
            },
        };
    }
    /**
     * Get all files in a PR (handles pagination)
     */
    async getPRFiles(prNumber) {
        const files = [];
        let page = 1;
        const perPage = 100;
        while (true) {
            const { data } = await this.octokit.rest.pulls.listFiles({
                owner: this.owner,
                repo: this.repo,
                pull_number: prNumber,
                per_page: perPage,
                page,
            });
            for (const file of data) {
                files.push({
                    filename: file.filename,
                    status: file.status,
                    additions: file.additions,
                    deletions: file.deletions,
                    changes: file.changes,
                    patch: file.patch,
                    previous_filename: file.previous_filename,
                });
            }
            if (data.length < perPage)
                break;
            page++;
        }
        return files;
    }
    /**
     * Post a comment on a PR
     */
    async postComment(prNumber, body) {
        const { data } = await this.octokit.rest.issues.createComment({
            owner: this.owner,
            repo: this.repo,
            issue_number: prNumber,
            body,
        });
        return data.id;
    }
    /**
     * Update an existing comment
     */
    async updateComment(commentId, body) {
        await this.octokit.rest.issues.updateComment({
            owner: this.owner,
            repo: this.repo,
            comment_id: commentId,
            body,
        });
    }
    /**
     * Reply to a review comment (line-specific)
     */
    async replyToReviewComment(prNumber, commentId, body) {
        await this.octokit.rest.pulls.createReplyForReviewComment({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
            comment_id: commentId,
            body,
        });
    }
    /**
     * Get a specific comment's context
     */
    async getCommentContext(commentId, prNumber) {
        // Try review comment first
        try {
            const { data } = await this.octokit.rest.pulls.getReviewComment({
                owner: this.owner,
                repo: this.repo,
                comment_id: commentId,
            });
            return {
                commentId: data.id,
                body: data.body,
                user: data.user?.login ?? 'unknown',
                path: data.path,
                line: data.line ?? data.original_line ?? undefined,
                diffHunk: data.diff_hunk,
                prNumber,
            };
        }
        catch {
            // Fall back to issue comment
            const { data } = await this.octokit.rest.issues.getComment({
                owner: this.owner,
                repo: this.repo,
                comment_id: commentId,
            });
            return {
                commentId: data.id,
                body: data.body ?? '',
                user: data.user?.login ?? 'unknown',
                prNumber,
            };
        }
    }
    /**
     * Add labels to a PR
     */
    async addLabels(prNumber, labels) {
        await this.octokit.rest.issues.addLabels({
            owner: this.owner,
            repo: this.repo,
            issue_number: prNumber,
            labels,
        });
    }
    /**
     * Remove a label from a PR
     */
    async removeLabel(prNumber, label) {
        try {
            await this.octokit.rest.issues.removeLabel({
                owner: this.owner,
                repo: this.repo,
                issue_number: prNumber,
                name: label,
            });
        }
        catch {
            // Label might not exist, ignore
        }
    }
    /**
     * Get existing bot comments on a PR
     */
    async getBotComments(prNumber, botIdentifier) {
        const { data } = await this.octokit.rest.issues.listComments({
            owner: this.owner,
            repo: this.repo,
            issue_number: prNumber,
        });
        return data
            .filter((c) => c.body?.includes(botIdentifier))
            .map((c) => ({ id: c.id, body: c.body ?? '' }));
    }
    /**
     * Find or create a specific bot comment (upsert pattern)
     */
    async upsertBotComment(prNumber, botIdentifier, body) {
        const existing = await this.getBotComments(prNumber, botIdentifier);
        const fullBody = `<!-- ${botIdentifier} -->\n${body}`;
        if (existing.length > 0) {
            await this.updateComment(existing[0].id, fullBody);
            return existing[0].id;
        }
        else {
            return await this.postComment(prNumber, fullBody);
        }
    }
    /**
     * Post a review comment on a specific line in a PR
     */
    async postReviewComment(prNumber, commit_id, path, line, body) {
        const { data } = await this.octokit.rest.pulls.createReviewComment({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
            commit_id,
            body,
            path,
            line,
        });
        return data.id;
    }
    /**
     * Post multiple review comments and return their IDs
     */
    async postReviewComments(prNumber, commit_id, comments) {
        const results = [];
        for (const comment of comments) {
            try {
                const id = await this.postReviewComment(prNumber, commit_id, comment.path, comment.line, comment.body);
                results.push({ id, path: comment.path, line: comment.line });
            }
            catch (error) {
                // Log error but continue with other comments
                console.error(`Failed to post comment on ${comment.path}:${comment.line}`, error);
            }
        }
        return results;
    }
    /**
     * Get the HEAD commit SHA for a PR
     */
    async getPRHeadSha(prNumber) {
        const { data: pr } = await this.octokit.rest.pulls.get({
            owner: this.owner,
            repo: this.repo,
            pull_number: prNumber,
        });
        return pr.head.sha;
    }
}
/**
 * Parse action context from GitHub event
 */
export function parseActionContext() {
    const context = github.context;
    return {
        eventName: context.eventName,
        action: context.payload.action ?? '',
        prNumber: context.payload.pull_request?.number ?? context.payload.issue?.number,
        commentId: context.payload.comment?.id,
        repo: {
            owner: context.repo.owner,
            repo: context.repo.repo,
        },
    };
}
