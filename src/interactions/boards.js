const { registerComponentHandler, registerModalHandler } = require("../utils/interactionRouter");
const { getSnapshot, snapshotModel } = require("../services/boards/boardData");
const actions = require("../services/boards/taskActions");
const { boardListView, boardViewById, columnView, commentView, taskViewById } = require("../services/boards/viewService");
const { boardCreateModal, boardEditModal, columnCreateModal } = require("../ui/boardViews");
const { newTaskModal } = require("../ui/taskForm");
const panels = require("../ui/taskPanels");
const { encode } = require("../utils/customId");
const { UserFacingError } = require("../utils/errorMessages");

/**
 * Moving around the views, board list → board → column → task → comments and back, and the forms
 * they open. Each step refetches as the user who clicked and replaces the message in place (or, for
 * someone other than the person it was made for, answers them privately).
 */

/** Forms must open within three seconds, so they use a copy of the board a few seconds old. */
async function cachedModel(ctx, boardId) {
    return snapshotModel(await getSnapshot(ctx, boardId));
}

registerComponentHandler("board", async (ctx, { action, args }) => {
    const [boardId, columnId, page] = args;

    // Forms first: they must be the first answer to the click.
    if (action === "new") {
        return ctx.showModal(boardCreateModal());
    }
    if (action === "addcol") {
        return ctx.showModal(columnCreateModal(boardId));
    }
    if (action === "addtask") {
        const model = await cachedModel(ctx, boardId);
        if (model.columns.length === 0) {
            throw new UserFacingError("No columns", "This board has no columns to add a task to yet.");
        }
        return ctx.showModal(newTaskModal({ customId: encode("brd", "task", boardId), model, chooseColumn: true }));
    }
    if (action === "edit") {
        return ctx.showModal(boardEditModal((await cachedModel(ctx, boardId)).board));
    }

    await ctx.deferUpdate();
    switch (action) {
        case "open":
            return ctx.update(await boardViewById(ctx, boardId));
        case "pick":
            return ctx.update(await boardViewById(ctx, ctx.interaction.values[0]));
        case "list":
            return ctx.update(await boardListView(ctx));
        case "column":
            return ctx.update(await columnView(ctx, boardId, ctx.interaction.values[0], 0));
        case "page":
            return ctx.update(await columnView(ctx, boardId, columnId, page));
        default:
            throw new UserFacingError("Not available", "That action is not available here.");
    }
});

registerComponentHandler("task", async (ctx, { action, args }) => {
    const [boardId, taskId] = args;
    await ctx.deferUpdate();
    if (action === "open") {
        await ctx.update(await taskViewById(ctx, boardId, ctx.interaction.values[0]));
    } else if (action === "show") {
        await ctx.update(await taskViewById(ctx, boardId, taskId));
    }
});

registerComponentHandler("comment", async (ctx, { action, args }) => {
    const [boardId, taskId, page] = args;
    if (action === "add") {
        return ctx.showModal(panels.commentModal(boardId, taskId, true));
    }
    if (action === "page") {
        await ctx.deferUpdate();
        await ctx.update(await commentView(ctx, boardId, taskId, page));
    }
});

/** A comment written from the comments: they show again, newest first, with it at the top. */
registerModalHandler("comment", async (ctx, { action, args }) => {
    const [boardId, taskId] = args;
    if (action !== "post") {
        throw new UserFacingError("Not available", "That form is not available here.");
    }
    const content = ctx.interaction.fields.getTextInputValue("content");
    await ctx.deferUpdate();
    await actions.addComment(ctx, boardId, taskId, content);
    await ctx.update(await commentView(ctx, boardId, taskId, 0));
});
