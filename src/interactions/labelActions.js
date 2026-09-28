const { registerComponentHandler } = require("../utils/interactionRouter");
const actions = require("../services/boards/labelActions");
const { labelListView, priorityListView } = require("../services/boards/labelFlows");
const { UserFacingError } = require("../utils/errorMessages");

/** Confirming (or cancelling) the deletion of a label or a priority level. */

registerComponentHandler("lbl", async (ctx, { action, args }) => {
    const [boardId, labelId] = args;
    await ctx.deferUpdate();
    if (action === "delete") {
        const result = await actions.deleteLabel(ctx, boardId, labelId);
        return ctx.update(await labelListView(ctx, boardId, result.notice));
    }
    if (action === "list") {
        return ctx.update(await labelListView(ctx, boardId));
    }
    throw new UserFacingError("Not available", "That action is not available here.");
});

registerComponentHandler("pri", async (ctx, { action, args }) => {
    const [boardId, priorityId] = args;
    await ctx.deferUpdate();
    if (action === "delete") {
        const result = await actions.deletePriority(ctx, boardId, priorityId);
        return ctx.update(await priorityListView(ctx, boardId, result.notice));
    }
    if (action === "list") {
        return ctx.update(await priorityListView(ctx, boardId));
    }
    throw new UserFacingError("Not available", "That action is not available here.");
});
