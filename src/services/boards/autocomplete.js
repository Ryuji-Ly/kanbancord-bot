const { truncate } = require("../../utils/format");
const { autocompleteChoices, getSnapshot, listBoards, resolveBoard, snapshotModel } = require("./boardData");

/**
 * Suggestions while typing a board or task option. Only what the user can see is suggested, since
 * the lists come from the API as that user.
 */

/** @param {import("../../utils/interactionContext").InteractionContext} ctx */
async function boardChoices(ctx, typed) {
    const boards = await listBoards(ctx);
    return autocompleteChoices(
        boards,
        typed,
        (board) => ({ name: truncate(`${board.name}${board.isArchived ? " (archived)" : ""}`, 100), value: String(board.boardId) }),
        (board) => board.name,
    );
}

/**
 * Tasks on the board chosen in the same command. Until a board is chosen there is nothing to
 * suggest; a board that cannot be found suggests nothing rather than failing.
 */
async function taskChoices(ctx, boardInput, typed) {
    if (!boardInput) {
        return [];
    }
    let board;
    try {
        board = await resolveBoard(ctx, boardInput);
    } catch {
        return [];
    }
    const model = snapshotModel(await getSnapshot(ctx, board.boardId));
    const columnNames = new Map(model.columns.map((column) => [column.columnId, column.name]));
    const tasks = model.columns.flatMap((column) => model.tasksIn(column.columnId));
    return autocompleteChoices(
        tasks,
        typed,
        (task) => ({
            name: truncate(`${task.title} — ${columnNames.get(task.columnId) ?? ""}`, 100),
            value: String(task.taskId),
        }),
        (task) => task.title,
    );
}

/** Answers autocomplete for a command with `board` and `task` options. */
async function respondBoardOrTask(ctx) {
    const options = ctx.interaction.options;
    const focused = options.getFocused(true);
    let choices = [];
    if (focused.name === "board") {
        choices = await boardChoices(ctx, focused.value);
    } else if (focused.name === "task") {
        choices = await taskChoices(ctx, options.getString("board"), focused.value);
    }
    await ctx.interaction.respond(choices);
}

module.exports = { boardChoices, taskChoices, respondBoardOrTask };
