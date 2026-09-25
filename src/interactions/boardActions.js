const { registerComponentHandler, registerModalHandler } = require("../utils/interactionRouter");
const actions = require("../services/boards/taskActions");
const { boardViewById } = require("../services/boards/viewService");
const { UserFacingError } = require("../utils/errorMessages");

/** Confirming a column deletion, and the board edit form. */

registerComponentHandler("col", async (ctx, { action, args }) => {
    const [boardId, columnId] = args;
    if (action !== "delete") {
        throw new UserFacingError("Not available", "That action is not available here.");
    }
    await ctx.deferUpdate();
    const result = await actions.deleteColumn(ctx, boardId, columnId);
    await ctx.update(await boardViewById(ctx, boardId, result.notice));
});

registerModalHandler("brd", async (ctx, { action, args }) => {
    const [boardId] = args;
    if (action !== "edit") {
        throw new UserFacingError("Not available", "That form is not available here.");
    }
    const fields = ctx.interaction.fields;
    await ctx.deferUpdate();
    const result = await actions.editBoard(ctx, boardId, {
        name: fields.getTextInputValue("name"),
        description: fields.getTextInputValue("description"),
    });
    await ctx.update(await boardViewById(ctx, boardId, result.notice));
});
