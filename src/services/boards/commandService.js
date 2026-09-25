const { boardEditModal, columnDeletePanel } = require("../../ui/boardViews");
const panels = require("../../ui/taskPanels");
const { parseDue } = require("../../utils/dueDate");
const { UserFacingError } = require("../../utils/errorMessages");
const { plain } = require("../../utils/format");
const actions = require("./taskActions");
const {
    getSnapshot,
    resolveBoard,
    resolveColumn,
    resolveLabel,
    resolvePriority,
    resolveTask,
    snapshotModel,
} = require("./boardData");
const { boardViewById, taskViewById } = require("./viewService");

/**
 * What each write command does, given its options. Commands only read their options and call these;
 * replies show the changed task, column or board, visible to the channel.
 */

/** The board and task a command names, as they are now. */
async function boardAndTask(ctx, { fresh = true } = {}) {
    const options = ctx.interaction.options;
    const board = await resolveBoard(ctx, options.getString("board", true));
    const snapshot = await getSnapshot(ctx, board.boardId, { fresh });
    return { board, model: snapshotModel(snapshot), task: resolveTask(snapshot, options.getString("task", true)) };
}

async function showTask(ctx, boardId, result) {
    await ctx.reply(await taskViewById(ctx, boardId, result.taskId, result.notice));
}

// ── /task ────────────────────────────────────────────────────────────────────

/** Opens the new-task form; the board and column come from the command, the rest from the form. */
async function taskCreate(ctx) {
    const options = ctx.interaction.options;
    const board = await resolveBoard(ctx, options.getString("board", true));
    const model = snapshotModel(await getSnapshot(ctx, board.boardId));
    const columnInput = options.getString("column");
    const column = columnInput ? resolveColumn(model, columnInput) : model.columns[0];
    if (!column) {
        throw new UserFacingError("No columns", "This board has no columns to add a task to yet.");
    }
    await ctx.showModal(panels.createTaskModal(board.boardId, column.columnId));
}

async function taskEdit(ctx) {
    // Forms must open within three seconds, so a copy of the board a few seconds old will do.
    const { board, task } = await boardAndTask(ctx, { fresh: false });
    await ctx.showModal(panels.editTaskModal(board.boardId, task));
}

async function taskMove(ctx) {
    await ctx.defer();
    const { board, model, task } = await boardAndTask(ctx);
    const column = resolveColumn(model, ctx.interaction.options.getString("column", true));
    await showTask(ctx, board.boardId, await actions.moveTask(ctx, board.boardId, task.taskId, column.columnId));
}

/**
 * Assigns or unassigns a person and/or a role; with neither given, the user who ran the command.
 * @param {boolean} assign
 */
async function taskAssign(ctx, assign) {
    await ctx.defer();
    const options = ctx.interaction.options;
    const { board, model, task } = await boardAndTask(ctx);
    const user = options.getUser("user");
    const role = options.getRole("role");
    const change = (current, id) => (assign ? [...new Set([...current, id])] : current.filter((entry) => entry !== id));

    let result;
    if (user || !role) {
        const userId = (user ?? ctx.user).id;
        result = await actions.setAssignees(ctx, board.boardId, task.taskId, change(model.assigneesOf(task), userId));
    }
    if (role) {
        result = await actions.setRoles(ctx, board.boardId, task.taskId, change(model.rolesOf(task), role.id));
    }
    await showTask(ctx, board.boardId, result);
}

/** Adds the label if the task does not have it, removes it if it does. */
async function taskLabel(ctx) {
    await ctx.defer();
    const { board, model, task } = await boardAndTask(ctx);
    const label = resolveLabel(model, ctx.interaction.options.getString("label", true));
    const applied = model.labelsOf(task).map((entry) => entry.labelId);
    const wanted = applied.includes(label.labelId)
        ? applied.filter((id) => id !== label.labelId)
        : [...applied, label.labelId];
    const result = await actions.setLabels(ctx, board.boardId, task.taskId, wanted);
    const notice = result.notice.startsWith("Updated")
        ? `${wanted.includes(label.labelId) ? "Added" : "Removed"} label **${plain(label.name, 60)}**`
        : result.notice;
    await showTask(ctx, board.boardId, { ...result, notice });
}

async function taskPriority(ctx) {
    await ctx.defer();
    const { board, model, task } = await boardAndTask(ctx);
    const level = resolvePriority(model, ctx.interaction.options.getString("priority", true));
    await showTask(ctx, board.boardId, await actions.setPriority(ctx, board.boardId, task.taskId, level ? level.priorityId : null));
}

async function taskDue(ctx) {
    const due = parseDue(ctx.interaction.options.getString("when", true));
    await ctx.defer();
    const { board, task } = await boardAndTask(ctx);
    await showTask(ctx, board.boardId, await actions.setDue(ctx, board.boardId, task.taskId, due));
}

/** Asks first: deleting a task cannot be undone. */
async function taskDelete(ctx) {
    await ctx.defer();
    const { model, task } = await boardAndTask(ctx);
    await ctx.reply(panels.deletePanel(model, task));
}

// ── /comment ─────────────────────────────────────────────────────────────────

async function commentAdd(ctx) {
    const { board, task } = await boardAndTask(ctx, { fresh: false });
    await ctx.showModal(panels.commentModal(board.boardId, task.taskId));
}

// ── /column ──────────────────────────────────────────────────────────────────

async function boardAndColumn(ctx) {
    const board = await resolveBoard(ctx, ctx.interaction.options.getString("board", true));
    const model = snapshotModel(await getSnapshot(ctx, board.boardId, { fresh: true }));
    return { board, model, column: resolveColumn(model, ctx.interaction.options.getString("column", true)) };
}

async function columnAdd(ctx) {
    await ctx.defer();
    const board = await resolveBoard(ctx, ctx.interaction.options.getString("board", true));
    const result = await actions.addColumn(ctx, board.boardId, ctx.interaction.options.getString("name", true));
    await ctx.reply(await boardViewById(ctx, board.boardId, result.notice));
}

async function columnRename(ctx) {
    await ctx.defer();
    const { board, column } = await boardAndColumn(ctx);
    const result = await actions.renameColumn(ctx, board.boardId, column.columnId, ctx.interaction.options.getString("name", true));
    await ctx.reply(await boardViewById(ctx, board.boardId, result.notice));
}

async function columnMove(ctx) {
    await ctx.defer();
    const { board, column } = await boardAndColumn(ctx);
    const result = await actions.moveColumn(ctx, board.boardId, column.columnId, ctx.interaction.options.getInteger("position", true));
    await ctx.reply(await boardViewById(ctx, board.boardId, result.notice));
}

/** Asks first, saying how many tasks go with the column. */
async function columnDelete(ctx) {
    await ctx.defer();
    const { board, model, column } = await boardAndColumn(ctx);
    await ctx.reply(columnDeletePanel(board.boardId, column, model.tasksIn(column.columnId).length));
}

// ── /board ───────────────────────────────────────────────────────────────────

async function boardCreate(ctx) {
    await ctx.defer();
    const options = ctx.interaction.options;
    const result = await actions.createBoard(ctx, { name: options.getString("name", true), description: options.getString("description") });
    await ctx.reply(await boardViewById(ctx, result.boardId, result.notice));
}

async function boardEdit(ctx) {
    const board = await resolveBoard(ctx, ctx.interaction.options.getString("board", true));
    await ctx.showModal(boardEditModal(board));
}

async function boardArchive(ctx, archived) {
    await ctx.defer();
    const board = await resolveBoard(ctx, ctx.interaction.options.getString("board", true));
    const result = await actions.setBoardArchived(ctx, board.boardId, archived);
    await ctx.reply(await boardViewById(ctx, board.boardId, result.notice));
}

module.exports = {
    taskCreate,
    taskEdit,
    taskMove,
    taskAssign,
    taskLabel,
    taskPriority,
    taskDue,
    taskDelete,
    commentAdd,
    columnAdd,
    columnRename,
    columnMove,
    columnDelete,
    boardCreate,
    boardEdit,
    boardArchive,
};
