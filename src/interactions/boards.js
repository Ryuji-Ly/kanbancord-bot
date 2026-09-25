const { registerComponentHandler } = require("../utils/interactionRouter");
const { boardViewById, columnView, commentView, taskViewById } = require("../services/boards/viewService");

/**
 * Moving around the read-only views: board → column → task → comments and back. Each step
 * refetches as the user who clicked and replaces the message in place.
 */

registerComponentHandler("board", async (ctx, { action, args }) => {
    const [boardId, columnId, page] = args;
    await ctx.deferUpdate();
    if (action === "open") {
        await ctx.update(await boardViewById(ctx, boardId));
    } else if (action === "column") {
        await ctx.update(await columnView(ctx, boardId, ctx.interaction.values[0], 0));
    } else if (action === "page") {
        await ctx.update(await columnView(ctx, boardId, columnId, page));
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
    if (action === "page") {
        await ctx.deferUpdate();
        await ctx.update(await commentView(ctx, boardId, taskId, page));
    }
});
