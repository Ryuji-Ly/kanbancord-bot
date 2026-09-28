const { registerComponentHandler, registerModalHandler } = require("../utils/interactionRouter");
const { getSnapshot, snapshotModel } = require("../services/boards/boardData");
const { interactionChannel, postBoard, requireCanPost } = require("../services/boards/boardPosts");
const actions = require("../services/boards/taskActions");
const { columnView, taskViewById } = require("../services/boards/viewService");
const { infoContainer } = require("../ui/containers");
const { postTaskModal, postedNotice } = require("../ui/postViews");
const { UserFacingError } = require("../utils/errorMessages");
const { readNewTask } = require("../ui/taskForm");

/**
 * Everything on a board post, and the question asked before posting one. A post belongs to the whole
 * channel, so nothing clicked on it ever changes it for everyone: columns, tasks and new tasks open
 * as a private message for whoever clicked, loaded with their own permissions. What they change there
 * reaches the post by itself, since the post follows the board.
 */

registerComponentHandler("post", async (ctx, { action, args }) => {
    const [boardId] = args;
    const values = ctx.interaction.values ?? [];

    switch (action) {
        case "column":
            await ctx.defer({ ephemeral: true });
            return ctx.reply(await columnView(ctx, boardId, values[0], 0));
        case "task":
            await ctx.defer({ ephemeral: true });
            return ctx.reply(await taskViewById(ctx, boardId, values[0]));
        case "add": {
            // Forms must open within three seconds, so a copy of the board a few seconds old will do.
            const model = snapshotModel(await getSnapshot(ctx, boardId));
            if (model.columns.length === 0) {
                throw new UserFacingError("No columns", "This board has no columns to add a task to yet.");
            }
            return ctx.showModal(postTaskModal(model));
        }
        // Asked before posting, privately, to the person posting.
        case "confirm": {
            await ctx.deferUpdate();
            const channel = await interactionChannel(ctx);
            requireCanPost(ctx, channel);
            const { board } = await postBoard(ctx, boardId, channel);
            return ctx.update(postedNotice(board.name));
        }
        case "cancel":
            await ctx.deferUpdate();
            return ctx.update(infoContainer("Not posted", "The board was not posted."));
        default:
            throw new UserFacingError("Not available", "That action is not available here.");
    }
});

registerModalHandler("post", async (ctx, { action, args }) => {
    const [boardId] = args;
    if (action !== "create") {
        throw new UserFacingError("Not available", "That form is not available here.");
    }
    const form = readNewTask(ctx.interaction.fields);
    await ctx.defer({ ephemeral: true });
    const result = await actions.createTask(ctx, boardId, form.columnId, form);
    await ctx.reply(await taskViewById(ctx, boardId, result.taskId, result.notice));
});
