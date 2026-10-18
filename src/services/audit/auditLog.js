const { getSnapshot, listBoards, resolveBoard } = require("../boards/boardData");
const { buildAuditPage } = require("../../ui/auditViews");
const { AUDIT_TYPES } = require("./auditTypes");

/**
 * What /audit shows: a page of the server's audit log, filtered like the website's, with the names
 * needed to say what each entry was about. The API checks that the user may view the audit log.
 */

/** How many entries one page asks for; fewer are shown when they don't fit in a message. */
const PAGE_SIZE = 10;

/**
 * @typedef {{ boardId: string | null, userId: string | null, type: string | null }} AuditFilter
 */

/** The filter from the command's options; a board is looked up by id or name. */
async function filterFromOptions(ctx) {
    const options = ctx.interaction.options;
    const boardInput = options.getString("board");
    const board = boardInput ? await resolveBoard(ctx, boardInput) : null;
    const type = options.getString("type");
    return {
        boardId: board ? String(board.boardId) : null,
        userId: options.getUser("user")?.id ?? null,
        type: AUDIT_TYPES[type] ? type : null,
    };
}

/** Entries older than `before` (the newest when it is null), and the cursor for more. */
async function fetchPage(ctx, filter, before = null) {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
    if (filter.boardId) query.set("boardId", filter.boardId);
    if (filter.userId) query.set("actorUserId", filter.userId);
    if (before) query.set("before", String(before));
    for (const entityType of AUDIT_TYPES[filter.type]?.entityTypes ?? []) {
        query.append("entityType", entityType);
    }
    const page = await ctx.api.get(`/audit-logs?${query}`);
    return { entries: page?.entries ?? [], nextBefore: page?.nextBefore ?? null };
}

/**
 * The names of the columns, labels, priority levels and tasks the entries refer to, from the
 * boards they are on. A board the user can no longer see just leaves its names out.
 */
async function namesFor(ctx, entries) {
    const names = { columns: {}, labels: {}, priorities: {}, tasks: {} };
    const boardIds = [...new Set(entries.map((entry) => entry.boardId).filter((id) => id !== null && id !== undefined))];
    const snapshots = await Promise.all(boardIds.map((id) => getSnapshot(ctx, id).catch(() => null)));
    for (const snapshot of snapshots.filter(Boolean)) {
        for (const column of snapshot.columns ?? []) names.columns[String(column.columnId)] = column.name;
        for (const label of snapshot.labels ?? []) names.labels[String(label.labelId)] = label.name;
        for (const level of snapshot.priorities ?? []) names.priorities[String(level.priorityId)] = level.name;
        for (const task of snapshot.tasks ?? []) names.tasks[String(task.taskId)] = task.title;
    }
    return names;
}

/** A page of the log, ready to send: the newest entries, or those older than `before`. */
async function auditPage(ctx, filter, before = null) {
    const [{ entries, nextBefore }, boards] = await Promise.all([fetchPage(ctx, filter, before), listBoards(ctx)]);
    const names = await namesFor(ctx, entries);
    const boardName = boards.find((board) => String(board.boardId) === filter.boardId)?.name;
    return buildAuditPage({ filter, entries, names, nextBefore, first: !before, boardName });
}

module.exports = { AUDIT_TYPES, auditPage, filterFromOptions, fetchPage, namesFor };
