const { buildBoardList, buildBoardOverview, buildColumnView } = require("../../ui/boardViews");
const { buildTaskView } = require("../../ui/taskViews");
const { COMMENT_PAGE_SIZE, buildCommentPage } = require("../../ui/commentViews");
const { UserFacingError } = require("../../utils/errorMessages");
const { getSnapshot, listBoards, resolveBoard, resolveTask, snapshotModel } = require("./boardData");

/**
 * The read-only views: each fetches what it shows, as the user, and returns a container. Replies
 * are only ever shown to the user who asked, since they show what that user may see.
 */

async function boardListView(ctx) {
    return buildBoardList(await listBoards(ctx));
}

/** @param {string} boardInput an id from autocomplete, or a typed name */
async function boardView(ctx, boardInput) {
    const board = await resolveBoard(ctx, boardInput);
    return buildBoardOverview(snapshotModel(await getSnapshot(ctx, board.boardId, { fresh: true })));
}

async function boardViewById(ctx, boardId) {
    return buildBoardOverview(snapshotModel(await getSnapshot(ctx, boardId, { fresh: true })));
}

async function columnView(ctx, boardId, columnId, page) {
    const model = snapshotModel(await getSnapshot(ctx, boardId, { fresh: true }));
    return buildColumnView(model, Number(columnId), Number(page) || 0);
}

/** @param {string} taskInput an id from autocomplete, or a typed title */
async function taskView(ctx, boardInput, taskInput) {
    const board = await resolveBoard(ctx, boardInput);
    const snapshot = await getSnapshot(ctx, board.boardId, { fresh: true });
    return buildTaskView(snapshotModel(snapshot), resolveTask(snapshot, taskInput));
}

async function taskViewById(ctx, boardId, taskId) {
    const model = snapshotModel(await getSnapshot(ctx, boardId, { fresh: true }));
    const task = model.task(Number(taskId));
    if (!task) {
        throw new UserFacingError("Task not found", "That task no longer exists, or you can no longer see it.");
    }
    return buildTaskView(model, task);
}

/** A page of comments, newest first. */
async function commentView(ctx, boardId, taskId, page = 0) {
    const model = snapshotModel(await getSnapshot(ctx, boardId));
    const task = model.task(Number(taskId));
    if (!task) {
        throw new UserFacingError("Task not found", "That task no longer exists, or you can no longer see it.");
    }
    if (!model.features.COMMENTS) {
        throw new UserFacingError("Comments are off", "Comments are turned off for this board.");
    }
    const wanted = Math.max(0, Number(page) || 0);
    const result = await ctx.api.get(`/boards/${boardId}/tasks/${task.taskId}/comments`, {
        query: { activeOnly: true, page: wanted, size: COMMENT_PAGE_SIZE, sort: "createdAt,desc" },
    });
    const pages = Math.max(1, Number(result?.totalPages) || 1);
    return buildCommentPage({
        board: model.board,
        task,
        comments: Array.isArray(result?.content) ? result.content : [],
        page: Math.min(wanted, pages - 1),
        pages,
        total: Number(result?.totalElements) || 0,
    });
}

/** For /comment list, which names a board and task rather than ids. */
async function commentViewFor(ctx, boardInput, taskInput) {
    const board = await resolveBoard(ctx, boardInput);
    const snapshot = await getSnapshot(ctx, board.boardId, { fresh: true });
    return commentView(ctx, board.boardId, resolveTask(snapshot, taskInput).taskId, 0);
}

module.exports = {
    boardListView,
    boardView,
    boardViewById,
    columnView,
    taskView,
    taskViewById,
    commentView,
    commentViewFor,
};
