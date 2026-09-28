const { getSnapshot, listBoards } = require("../boards/boardData");

/**
 * What this server has done so far, for the guide's ticks, found out as the user. Each part is
 * best-effort: anything the user may not see (the feeds, for someone who is not a server manager)
 * or that fails is left out, and its step is simply not ticked.
 */

/** Boards looked into for tasks; enough to tell whether the server has any. */
const BOARDS_CHECKED = 3;

/** @returns {Promise<import("../../ui/guideViews").GuideState>} */
async function guideState(ctx) {
    const [features, boards, notifications] = await Promise.allSettled([
        ctx.api.get("/features"),
        listBoards(ctx),
        ctx.api.get("/notifications"),
    ]);
    const state = {};
    if (features.status === "fulfilled" && features.value) {
        state.features = features.value;
    }
    if (notifications.status === "fulfilled") {
        state.feeds = notifications.value?.feeds?.length ?? 0;
    }
    if (boards.status === "fulfilled") {
        state.boards = boards.value.length;
        const snapshots = await Promise.allSettled(boards.value.slice(0, BOARDS_CHECKED)
            .map((board) => getSnapshot(ctx, board.boardId)));
        state.tasks = snapshots
            .filter((result) => result.status === "fulfilled")
            .reduce((sum, result) => sum + (result.value?.tasks?.length ?? 0), 0);
    }
    return state;
}

module.exports = { guideState };
