const { registerComponentHandler, registerModalHandler } = require("../utils/interactionRouter");
const { getSnapshot, snapshotModel } = require("../services/boards/boardData");
const actions = require("../services/boards/taskActions");
const { boardViewById, columnView, taskViewById } = require("../services/boards/viewService");
const { columnDeletePanel, columnRenameModal } = require("../ui/boardViews");
const { newTaskModal, readNewTask } = require("../ui/taskForm");
const { encode } = require("../utils/customId");
const { UserFacingError } = require("../utils/errorMessages");

/**
 * Changing a board and its columns from their views: the column view's controls, and the forms for a
 * new board, a new column, a new task, a column's name and the board's details. Every change is made
 * as whoever uses the control; the result replaces the view.
 */

async function requireColumn(ctx, boardId, columnId, { fresh = false } = {}) {
    const model = snapshotModel(await getSnapshot(ctx, boardId, { fresh }));
    const column = model.column(Number(columnId));
    if (!column) {
        throw new UserFacingError("Column not found", "That column no longer exists.");
    }
    return { model, column };
}

registerComponentHandler("col", async (ctx, { action, args }) => {
    const [boardId, columnId] = args;

    // Forms first: they must be the first answer to the click.
    if (action === "rename") {
        return ctx.showModal(columnRenameModal(boardId, (await requireColumn(ctx, boardId, columnId)).column));
    }
    if (action === "addtask") {
        const { model } = await requireColumn(ctx, boardId, columnId);
        return ctx.showModal(newTaskModal({ customId: encode("act", "create", boardId, columnId), model }));
    }

    await ctx.deferUpdate();
    switch (action) {
        // Asks first, saying how many tasks go with the column.
        case "ask": {
            const { model, column } = await requireColumn(ctx, boardId, columnId, { fresh: true });
            return ctx.update(columnDeletePanel(boardId, column, model.tasksIn(column.columnId).length));
        }
        case "delete": {
            const result = await actions.deleteColumn(ctx, boardId, columnId);
            return ctx.update(await boardViewById(ctx, boardId, result.notice));
        }
        case "move": {
            const result = await actions.moveColumn(ctx, boardId, columnId, Number(ctx.interaction.values[0]));
            return ctx.update(await columnView(ctx, boardId, columnId, 0, result.notice));
        }
        default:
            throw new UserFacingError("Not available", "That action is not available here.");
    }
});

registerModalHandler("col", async (ctx, { action, args }) => {
    const [boardId, columnId] = args;
    if (action !== "rename") {
        throw new UserFacingError("Not available", "That form is not available here.");
    }
    const name = ctx.interaction.fields.getTextInputValue("name");
    await ctx.deferUpdate();
    const result = await actions.renameColumn(ctx, boardId, columnId, name);
    await ctx.update(await columnView(ctx, boardId, columnId, 0, result.notice));
});

registerModalHandler("brd", async (ctx, { action, args }) => {
    const [boardId] = args;
    const fields = ctx.interaction.fields;
    switch (action) {
        case "edit": {
            await ctx.deferUpdate();
            const result = await actions.editBoard(ctx, boardId, {
                name: fields.getTextInputValue("name"),
                description: fields.getTextInputValue("description"),
            });
            return ctx.update(await boardViewById(ctx, boardId, result.notice));
        }
        case "create": {
            await ctx.deferUpdate();
            const result = await actions.createBoard(ctx, {
                name: fields.getTextInputValue("name"),
                description: fields.getTextInputValue("description"),
            });
            return ctx.update(await boardViewById(ctx, result.boardId, result.notice));
        }
        case "column": {
            const name = fields.getTextInputValue("name");
            await ctx.deferUpdate();
            const result = await actions.addColumn(ctx, boardId, name);
            return ctx.update(await boardViewById(ctx, boardId, result.notice));
        }
        // A task from the board's form, which asks which column it goes in.
        case "task": {
            const form = readNewTask(fields);
            await ctx.deferUpdate();
            const result = await actions.createTask(ctx, boardId, form.columnId, form);
            return ctx.update(await taskViewById(ctx, boardId, result.taskId, result.notice));
        }
        default:
            throw new UserFacingError("Not available", "That form is not available here.");
    }
});
