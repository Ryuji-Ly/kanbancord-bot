const { truncate } = require("../../utils/format");
const { autocompleteChoices, getSnapshot, listBoards, resolveBoard, snapshotModel } = require("./boardData");

/**
 * Suggestions while typing a board, task, column, priority or label option. Only what the user can
 * see is suggested, since the lists come from the API as that user. Everything but the board
 * follows the board chosen in the same command.
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

/** The chosen board's contents, or null until a board is chosen (or if it cannot be found). */
async function chosenBoard(ctx, boardInput) {
    if (!boardInput) {
        return null;
    }
    try {
        const board = await resolveBoard(ctx, boardInput);
        return snapshotModel(await getSnapshot(ctx, board.boardId));
    } catch {
        return null;
    }
}

function taskChoices(model, typed) {
    const columnNames = new Map(model.columns.map((column) => [column.columnId, column.name]));
    const tasks = model.columns.flatMap((column) => model.tasksIn(column.columnId));
    return autocompleteChoices(
        tasks,
        typed,
        (task) => ({ name: truncate(`${task.title} — ${columnNames.get(task.columnId) ?? ""}`, 100), value: String(task.taskId) }),
        (task) => task.title,
    );
}

function columnChoices(model, typed) {
    return autocompleteChoices(
        model.columns,
        typed,
        (column) => ({ name: truncate(`${column.name} (${model.tasksIn(column.columnId).length} tasks)`, 100), value: String(column.columnId) }),
        (column) => column.name,
    );
}

function priorityChoices(model, typed) {
    const levels = autocompleteChoices(
        model.priorities(),
        typed,
        (level) => ({ name: truncate(level.name, 100), value: String(level.priorityId) }),
        (level) => level.name,
    ).slice(0, 24);
    return [...levels, { name: "No priority", value: "none" }];
}

function labelChoices(model, typed) {
    return autocompleteChoices(
        model.labels(),
        typed,
        (label) => ({ name: truncate(label.name, 100), value: String(label.labelId) }),
        (label) => label.name,
    );
}

const FOLLOWING_BOARD = { task: taskChoices, column: columnChoices, priority: priorityChoices, label: labelChoices };

/** Answers autocomplete for any command whose options include `board` and those that follow it. */
async function respondBoardOptions(ctx) {
    const options = ctx.interaction.options;
    const focused = options.getFocused(true);
    let choices = [];
    if (focused.name === "board") {
        choices = await boardChoices(ctx, focused.value);
    } else if (FOLLOWING_BOARD[focused.name]) {
        const model = await chosenBoard(ctx, options.getString("board"));
        choices = model ? FOLLOWING_BOARD[focused.name](model, focused.value) : [];
    }
    await ctx.interaction.respond(choices);
}

module.exports = { boardChoices, respondBoardOptions };
