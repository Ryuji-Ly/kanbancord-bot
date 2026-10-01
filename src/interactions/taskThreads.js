const { registerComponentHandler } = require("../utils/interactionRouter");
const { getSnapshot, listBoards, snapshotModel } = require("../services/boards/boardData");
const { requireCanThreadIn } = require("../services/boards/threadSettings");
const { discordSenders } = require("../delivery/deliverPlan");
const { rememberThread } = require("../delivery/taskThreads");
const { buildFeedCard } = require("../ui/feedViews");
const { buildContainer, v2Payload } = require("../ui/containers");
const { enableThreadsPrompt, threadReady } = require("../ui/threadViews");
const { UserFacingError } = require("../utils/errorMessages");

/**
 * "Discuss in thread": opens the task's thread, making it now if it has none. With threads off for
 * the board, someone who may edit the board is offered to switch them on; anyone else is told they
 * are off. Answers are only shown to the person who clicked.
 */

/** Makes the task's thread now, as delivery would have, and reports it. */
async function startThread(ctx, boardId, taskId, info) {
    requireCanThreadIn(ctx, info.channelId, info.privateThread);
    const senders = discordSenders(ctx.client);
    const thread = await senders.createThread(info.channelId, { name: info.name.slice(0, 100), privateThread: info.privateThread });
    rememberThread(taskId, info.channelId, thread.id);
    const model = snapshotModel(await getSnapshot(ctx, boardId, { fresh: true }));
    const task = model.task(Number(taskId));
    await senders.sendToChannel(thread.id, v2Payload(task
        ? buildFeedCard(model, task)
        : buildContainer({ title: info.name, body: "Discussion of this task." })));
    if (info.privateThread && info.members.length > 0) {
        await senders.addThreadMembers(thread.id, info.members);
    }
    await senders.reportThread({
        serverId: ctx.guildId, taskId: Number(taskId), channelId: info.channelId, threadId: thread.id,
        privateThread: info.privateThread,
    });
    return thread.id;
}

/** The thread, made now if need be, as a link for the person who clicked. */
async function openThread(ctx, boardId, taskId, info, notice) {
    const threadId = info.threadId ?? await startThread(ctx, boardId, taskId, info);
    const privateFor = info.privateThread && !info.members.includes(ctx.user.id)
        ? "only the task's creator and assignees are in it, so you may not be able to open it"
        : null;
    return threadReady({
        serverId: ctx.guildId,
        threadId,
        taskTitle: info.name,
        notice: notice ?? (info.threadId ? null : `Started this task's thread: <#${threadId}>.`),
        privateFor,
    });
}

registerComponentHandler("thr", async (ctx, { action, args }) => {
    const [boardId, taskId, buttonChannelId] = args;
    if (action === "cancel") {
        await ctx.deferUpdate();
        return ctx.update(buildContainer({ title: "Task threads", body: "Nothing changed." }));
    }
    const path = `/boards/${boardId}/tasks/${taskId}/thread`;

    if (action === "open") {
        await ctx.defer({ ephemeral: true });
        const info = await ctx.api.get(path);
        if (info.enabled) {
            return ctx.reply(await openThread(ctx, boardId, taskId, info));
        }
        if (!info.available) {
            throw new UserFacingError("No threads here", "This board has no update feed, so its tasks cannot have "
                + "threads. A server manager can add one with `/kanbancord feed`.");
        }
        if (!info.canEnable) {
            throw new UserFacingError("Threads are off", "Task threads are not switched on for this board. Someone "
                + "who can edit the board can switch them on with `/board threads`.");
        }
        const board = (await listBoards(ctx)).find((entry) => String(entry.boardId) === String(boardId)) ?? { boardId, name: "this board" };
        return ctx.reply(enableThreadsPrompt({ board, taskId, channels: info.channels }));
    }

    if (action === "enable") {
        await ctx.deferUpdate();
        const channelId = buttonChannelId ?? ctx.interaction.values?.[0];
        if (!channelId) {
            throw new UserFacingError("Not available", "That action is not available here.");
        }
        requireCanThreadIn(ctx, channelId, false);
        await ctx.api.put(`/boards/${boardId}/threads`, { body: { channelId, privateThreads: false, updates: "BOTH" } });
        const info = await ctx.api.get(path);
        const view = await openThread(ctx, boardId, taskId, info);
        return ctx.update(view);
    }
    throw new UserFacingError("Not available", "That action is not available here.");
});

module.exports = { startThread };
