const { UserFacingError } = require("../../utils/errorMessages");
const { toServerTime } = require("../../utils/dueDate");
const { parseServerTime } = require("../../utils/format");
const { forgetBoard, getSnapshot, snapshotModel } = require("./boardData");

/**
 * Changes to tasks, comments, columns and boards, made as the user. The API checks every one of
 * them; these only shape the requests. Each returns what the reply should say.
 */

const TITLE_MAX = 200;

/** The board as it is now, not a cached copy: changes are worked out against the current state. */
async function currentModel(ctx, boardId) {
    return snapshotModel(await getSnapshot(ctx, boardId, { fresh: true }));
}

function requireTask(model, taskId) {
    const task = model.task(Number(taskId));
    if (!task) {
        throw new UserFacingError("Task not found", "That task no longer exists, or you can no longer see it.");
    }
    return task;
}

/**
 * The whole task as an edit request: the API treats every edit as the full task, so fields that
 * are not being changed are sent as they are.
 */
function taskRequest(task, changes = {}) {
    return {
        title: task.title,
        description: task.description ?? null,
        boardId: task.boardId,
        columnId: task.columnId,
        priorityId: task.priorityId ?? null,
        dueDate: task.dueDate ?? null,
        ...changes,
    };
}

async function after(ctx, boardId, result) {
    forgetBoard(ctx, boardId);
    return result;
}

async function createTask(ctx, boardId, columnId, { title, description }) {
    const task = await ctx.api.post(`/boards/${boardId}/tasks`, {
        body: {
            title: title.trim().slice(0, TITLE_MAX),
            description: description?.trim() || null,
            boardId: Number(boardId),
            columnId: Number(columnId),
        },
    });
    return after(ctx, boardId, { taskId: task.taskId, notice: `Created **${task.title}**` });
}

async function editTask(ctx, boardId, taskId, { title, description }) {
    const task = requireTask(await currentModel(ctx, boardId), taskId);
    const changes = { title: title.trim().slice(0, TITLE_MAX) };
    if (description !== undefined) {
        changes.description = description.trim() || null;
    }
    await ctx.api.put(`/boards/${boardId}/tasks/${task.taskId}`, { body: taskRequest(task, changes) });
    return after(ctx, boardId, { taskId: task.taskId, notice: "Saved your changes" });
}

async function moveTask(ctx, boardId, taskId, columnId) {
    const model = await currentModel(ctx, boardId);
    const task = requireTask(model, taskId);
    const column = model.column(Number(columnId));
    if (!column) {
        throw new UserFacingError("Column not found", "That column no longer exists.");
    }
    if (column.columnId === task.columnId) {
        return { taskId: task.taskId, notice: `Already in **${column.name}**` };
    }
    // To the bottom of the column, like dropping it at the end.
    const index = model.tasksIn(column.columnId).length;
    await ctx.api.post(`/boards/${boardId}/tasks/${task.taskId}/move`, { body: { columnId: column.columnId, index } });
    return after(ctx, boardId, { taskId: task.taskId, notice: `Moved to **${column.name}**` });
}

async function setPriority(ctx, boardId, taskId, priorityId) {
    const model = await currentModel(ctx, boardId);
    const task = requireTask(model, taskId);
    const level = priorityId === null ? null : model.priorities().find((entry) => entry.priorityId === Number(priorityId));
    if (priorityId !== null && !level) {
        throw new UserFacingError("Priority not found", "That priority level no longer exists on this board.");
    }
    await ctx.api.put(`/boards/${boardId}/tasks/${task.taskId}`, {
        body: taskRequest(task, { priorityId: level ? level.priorityId : null }),
    });
    return after(ctx, boardId, { taskId: task.taskId, notice: level ? `Priority set to **${level.name}**` : "Priority removed" });
}

/** @param {Date | null} due */
async function setDue(ctx, boardId, taskId, due) {
    const task = requireTask(await currentModel(ctx, boardId), taskId);
    await ctx.api.put(`/boards/${boardId}/tasks/${task.taskId}`, { body: taskRequest(task, { dueDate: toServerTime(due) }) });
    const when = due ? `<t:${Math.floor(due.getTime() / 1000)}:f>` : null;
    return after(ctx, boardId, { taskId: task.taskId, notice: when ? `Due ${when}` : "Due date removed" });
}

/**
 * Makes the task's assigned people exactly `userIds`, adding and removing as needed. Each change is
 * its own request, so one refusal (say, assigning someone else without permission) does not undo
 * the rest; the reply says what could not be done.
 */
async function setAssignees(ctx, boardId, taskId, userIds) {
    const model = await currentModel(ctx, boardId);
    const task = requireTask(model, taskId);
    const wanted = new Set(userIds.map(String));
    const current = model.assignmentsOf(task);
    const toAdd = [...wanted].filter((id) => !current.some((assignment) => String(assignment.userId) === id));
    const toRemove = current.filter((assignment) => !wanted.has(String(assignment.userId)));

    const failures = [];
    for (const userId of toAdd) {
        await ctx.api.post(`/boards/${boardId}/tasks/${task.taskId}/assignments`, { body: { taskId: task.taskId, userId } })
            .catch((error) => failures.push(`<@${userId}>: ${error.message}`));
    }
    for (const assignment of toRemove) {
        await ctx.api.delete(`/boards/${boardId}/tasks/${task.taskId}/assignments/${assignment.id}`)
            .catch((error) => failures.push(`<@${assignment.userId}>: ${error.message}`));
    }
    return after(ctx, boardId, { taskId: task.taskId, notice: summarise("assigned people", toAdd.length + toRemove.length, failures) });
}

/** Like setAssignees, for Discord roles. */
async function setRoles(ctx, boardId, taskId, roleIds) {
    const model = await currentModel(ctx, boardId);
    const task = requireTask(model, taskId);
    const wanted = new Set(roleIds.map(String));
    const current = model.roleAssignmentsOf(task);
    const toAdd = [...wanted].filter((id) => !current.some((assignment) => String(assignment.roleId) === id));
    const toRemove = current.filter((assignment) => !wanted.has(String(assignment.roleId)));

    const failures = [];
    for (const roleId of toAdd) {
        await ctx.api.post(`/boards/${boardId}/tasks/${task.taskId}/role-assignments`, { body: { roleId } })
            .catch((error) => failures.push(`<@&${roleId}>: ${error.message}`));
    }
    for (const assignment of toRemove) {
        await ctx.api.delete(`/boards/${boardId}/tasks/${task.taskId}/role-assignments/${assignment.id}`)
            .catch((error) => failures.push(`<@&${assignment.roleId}>: ${error.message}`));
    }
    return after(ctx, boardId, { taskId: task.taskId, notice: summarise("assigned roles", toAdd.length + toRemove.length, failures) });
}

/** Like setAssignees, for labels. */
async function setLabels(ctx, boardId, taskId, labelIds) {
    const model = await currentModel(ctx, boardId);
    const task = requireTask(model, taskId);
    const wanted = new Set(labelIds.map(Number));
    const current = model.taskLabelsOf(task);
    const toAdd = [...wanted].filter((id) => !current.some((entry) => entry.labelId === id));
    const toRemove = current.filter((entry) => !wanted.has(entry.labelId));
    const nameOf = (labelId) => model.labels().find((label) => label.labelId === labelId)?.name ?? `#${labelId}`;

    const failures = [];
    for (const labelId of toAdd) {
        await ctx.api.post(`/boards/${boardId}/tasks/${task.taskId}/labels`, { body: { taskId: task.taskId, labelId } })
            .catch((error) => failures.push(`${nameOf(labelId)}: ${error.message}`));
    }
    for (const entry of toRemove) {
        await ctx.api.delete(`/boards/${boardId}/tasks/${task.taskId}/labels/${entry.id}`)
            .catch((error) => failures.push(`${nameOf(entry.labelId)}: ${error.message}`));
    }
    return after(ctx, boardId, { taskId: task.taskId, notice: summarise("labels", toAdd.length + toRemove.length, failures) });
}

function summarise(what, changes, failures) {
    if (failures.length > 0) {
        return `Some changes to ${what} could not be made:\n${failures.map((line) => `- ${line}`).join("\n")}`;
    }
    return changes === 0 ? `No changes to ${what}` : `Updated ${what}`;
}

async function deleteTask(ctx, boardId, taskId) {
    const model = await currentModel(ctx, boardId);
    const task = requireTask(model, taskId);
    await ctx.api.delete(`/boards/${boardId}/tasks/${task.taskId}`);
    return after(ctx, boardId, { columnId: task.columnId, notice: `Deleted **${task.title}**` });
}

async function addComment(ctx, boardId, taskId, content) {
    await ctx.api.post(`/boards/${boardId}/tasks/${taskId}/comments`, {
        body: { taskId: Number(taskId), content: content.trim() },
    });
    return { taskId: Number(taskId), notice: "Comment added" };
}

// ── Columns ──────────────────────────────────────────────────────────────────

async function addColumn(ctx, boardId, name) {
    const column = await ctx.api.post(`/boards/${boardId}/columns`, { body: { name: name.trim(), boardId: Number(boardId) } });
    return after(ctx, boardId, { columnId: column.columnId, notice: `Added column **${column.name}**` });
}

async function renameColumn(ctx, boardId, columnId, name) {
    const column = (await currentModel(ctx, boardId)).column(Number(columnId));
    if (!column) {
        throw new UserFacingError("Column not found", "That column no longer exists.");
    }
    // No position: sending one would also need permission to move columns.
    await ctx.api.put(`/boards/${boardId}/columns/${column.columnId}`, {
        body: { name: name.trim(), boardId: Number(boardId), color: column.color ?? null, wipLimit: column.wipLimit ?? null },
    });
    return after(ctx, boardId, { columnId: column.columnId, notice: `Renamed **${column.name}** to **${name.trim()}**` });
}

/** @param {number} position 1 is the first column */
async function moveColumn(ctx, boardId, columnId, position) {
    const model = await currentModel(ctx, boardId);
    const column = model.column(Number(columnId));
    if (!column) {
        throw new UserFacingError("Column not found", "That column no longer exists.");
    }
    const index = Math.min(Math.max(1, position), model.columns.length) - 1;
    await ctx.api.post(`/boards/${boardId}/columns/${column.columnId}/move`, { body: { index } });
    return after(ctx, boardId, { notice: `Moved **${column.name}** to position ${index + 1}` });
}

async function deleteColumn(ctx, boardId, columnId) {
    const column = (await currentModel(ctx, boardId)).column(Number(columnId));
    if (!column) {
        throw new UserFacingError("Column not found", "That column no longer exists.");
    }
    await ctx.api.delete(`/boards/${boardId}/columns/${column.columnId}`);
    return after(ctx, boardId, { notice: `Deleted column **${column.name}**` });
}

// ── Boards ───────────────────────────────────────────────────────────────────

async function createBoard(ctx, { name, description }) {
    const board = await ctx.api.post("/boards", {
        body: { name: name.trim(), description: description?.trim() || null, serverId: ctx.guildId },
    });
    forgetBoard(ctx, board.boardId);
    return { boardId: board.boardId, notice: `Created board **${board.name}**` };
}

async function editBoard(ctx, boardId, { name, description }) {
    const board = await ctx.api.put(`/boards/${boardId}`, {
        body: { name: name.trim(), description: description?.trim() ?? "", serverId: ctx.guildId, columnNames: [] },
    });
    return after(ctx, boardId, { boardId: board.boardId, notice: "Saved the board" });
}

async function setBoardArchived(ctx, boardId, archived) {
    const board = await ctx.api.patch(`/boards/${boardId}/archive`, { query: { archived } });
    return after(ctx, boardId, {
        boardId: board.boardId,
        notice: archived ? `Archived **${board.name}**` : `Restored **${board.name}**`,
    });
}

/** When a task is due, for the due-date form. */
function dueOf(task) {
    return parseServerTime(task.dueDate);
}

module.exports = {
    currentModel,
    requireTask,
    taskRequest,
    createTask,
    editTask,
    moveTask,
    setPriority,
    setDue,
    setAssignees,
    setRoles,
    setLabels,
    deleteTask,
    addComment,
    addColumn,
    renameColumn,
    moveColumn,
    deleteColumn,
    createBoard,
    editBoard,
    setBoardArchived,
    dueOf,
};
