const { MessageFlags, Routes } = require("discord.js");
const { claimPosts, postSnapshot, reportPosts } = require("../api/boardPostApi");
const { snapshotModel } = require("../services/boards/boardData");
const { buildBoardPost, buildDeletedPost } = require("../ui/postViews");
const logger = require("../utils/logger");

/**
 * Keeps board posts up to date, on one shard only: claims posts whose board changed, redraws each
 * from the whole board and reports what happened. The API only hands out a post a couple of seconds
 * after its last change, so a burst of changes is one edit. Asks again at once while there is more
 * to do, every couple of seconds when there is not, and backs off while KanbanCord cannot be reached.
 */

const IDLE_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;
const BATCH = 20;

/** The message or channel no longer exists: the post is gone for good. */
const GONE = new Set([10003, 10008]);
/** The thread was archived; it can be reopened to edit the post. */
const THREAD_ARCHIVED = 50083;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Edits messages through Discord's REST API, which works for any channel from any shard. */
function discordEditor(client) {
    return {
        edit: (channelId, messageId, containers) => client.rest.patch(Routes.channelMessage(channelId, messageId), {
            body: {
                components: containers.map((container) => container.toJSON()),
                flags: MessageFlags.IsComponentsV2,
                allowed_mentions: { parse: [] },
            },
        }),
        reopenThread: (channelId) => client.rest.patch(Routes.channel(channelId), { body: { archived: false } }),
    };
}

/** Draws one post; returns "done", "gone" or "retry". */
async function redraw(post, loadModel, editor) {
    let containers;
    let finalDrawing = false;
    if (!post.boardExists) {
        containers = [buildDeletedPost()];
        finalDrawing = true;
    } else {
        const model = await loadModel(post.serverId, post.boardId);
        if (!model) {
            containers = [buildDeletedPost()];
            finalDrawing = true;
        } else {
            containers = [buildBoardPost(model)];
        }
    }

    const edit = () => editor.edit(post.channelId, post.messageId, containers);
    try {
        await edit();
    } catch (error) {
        if (GONE.has(error.code)) {
            return "gone";
        }
        if (error.code !== THREAD_ARCHIVED) {
            throw error;
        }
        // Reopening needs the thread not to be locked (or Manage Threads); otherwise try later.
        await editor.reopenThread(post.channelId);
        await edit();
    }
    return finalDrawing ? "gone" : "done";
}

/** One round: claim, redraw, report. Returns how many posts it handled. */
async function runOnce(editor, api = { claimPosts, postSnapshot, reportPosts }) {
    const posts = await api.claimPosts(BATCH);
    if (posts.length === 0) {
        return 0;
    }
    // Posts of the same board are drawn from one copy of it.
    const boards = new Map();
    const loadModel = (serverId, boardId) => {
        const key = `${serverId}:${boardId}`;
        if (!boards.has(key)) {
            boards.set(key, api.postSnapshot(serverId, boardId).then(snapshotModel).catch((error) => {
                // Deleted since it was claimed: the post says so.
                if (error.status === 404) {
                    return null;
                }
                throw error;
            }));
        }
        return boards.get(key);
    };

    const outcome = { done: [], gone: [], retry: [] };
    for (const post of posts) {
        try {
            outcome[await redraw(post, loadModel, editor)].push(post.postId);
        } catch (error) {
            logger.warn(`[Posts] Could not update post ${post.postId} (${post.channelId}/${post.messageId}): ${error.message}`);
            outcome.retry.push(post.postId);
        }
    }
    await api.reportPosts(outcome).catch((error) => logger.warn(`[Posts] Could not report: ${error.message}`));
    return posts.length;
}

function startPostWorker(client, { sleep = wait } = {}) {
    const editor = discordEditor(client);
    let stopped = false;
    let backoff = IDLE_MS;

    (async () => {
        logger.info("[Posts] Keeping board posts up to date");
        while (!stopped) {
            try {
                const handled = await runOnce(editor);
                backoff = IDLE_MS;
                if (handled < BATCH) {
                    await sleep(IDLE_MS);
                }
            } catch (error) {
                logger.warn(`[Posts] Could not collect board posts: ${error.message}`);
                await sleep(backoff);
                backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
            }
        }
    })();

    return () => {
        stopped = true;
    };
}

module.exports = { runOnce, startPostWorker };
