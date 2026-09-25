const { TtlCache } = require("../../utils/ttlCache");
const { UserFacingError } = require("../../utils/errorMessages");

/**
 * Boards and their contents, fetched as the user who asked. Results are cached for a few seconds
 * per user (never shared between users, since what each user may see differs), so autocomplete
 * does not call the API on every keystroke.
 */

const boardLists = new TtlCache(30_000, 2000);
const snapshots = new TtlCache(10_000, 2000);

/** @param {import("../../utils/interactionContext").InteractionContext} ctx */
function cacheKey(ctx, ...parts) {
    return [ctx.guildId, ctx.user.id, ...parts].join(":");
}

/** The boards the user can see in this server, active ones first, then by name. */
async function listBoards(ctx) {
    return boardLists.getOrLoad(cacheKey(ctx), async () => {
        const page = await ctx.api.get("/boards", { query: { size: 500 } });
        const boards = Array.isArray(page?.content) ? page.content : [];
        return boards.sort((a, b) =>
            Number(Boolean(a.isArchived)) - Number(Boolean(b.isArchived)) || a.name.localeCompare(b.name));
    });
}

/**
 * Everything on one board the user can see. `fresh` skips the cache, for views the user asked for
 * directly; autocomplete may use a copy a few seconds old.
 */
async function getSnapshot(ctx, boardId, { fresh = false } = {}) {
    const key = cacheKey(ctx, boardId);
    if (fresh) {
        snapshots.delete(key);
    }
    return snapshots.getOrLoad(key, () => ctx.api.get(`/boards/${boardId}/snapshot`));
}

/** Forgets cached data for a board, after the user changed it. */
function forgetBoard(ctx, boardId) {
    snapshots.delete(cacheKey(ctx, boardId));
    boardLists.delete(cacheKey(ctx));
}

/**
 * Finds what the user meant: autocomplete sends an id, but someone can also type a name and press
 * enter. Ids match exactly; names match ignoring case, then as a unique beginning.
 *
 * @template T
 * @param {T[]} items
 * @param {string} input
 * @param {(item: T) => number} idOf
 * @param {(item: T) => string} nameOf
 * @param {string} kind for the message when nothing matches, e.g. "board"
 * @returns {T}
 */
function resolveByIdOrName(items, input, idOf, nameOf, kind) {
    const text = String(input ?? "").trim();
    const byId = items.find((item) => String(idOf(item)) === text);
    if (byId) {
        return byId;
    }
    const lower = text.toLowerCase();
    const exact = items.filter((item) => nameOf(item).toLowerCase() === lower);
    if (exact.length === 1) {
        return exact[0];
    }
    const starts = items.filter((item) => nameOf(item).toLowerCase().startsWith(lower));
    if (exact.length === 0 && starts.length === 1 && lower) {
        return starts[0];
    }
    if (exact.length > 1 || starts.length > 1) {
        throw new UserFacingError(`Which ${kind}?`, `More than one ${kind} matches "${text}". Pick one from the list.`);
    }
    throw new UserFacingError(`No such ${kind}`, `No ${kind} you can see matches "${text}". Pick one from the list.`);
}

async function resolveBoard(ctx, input) {
    return resolveByIdOrName(await listBoards(ctx), input, (board) => board.boardId, (board) => board.name, "board");
}

function resolveTask(snapshot, input) {
    return resolveByIdOrName(snapshot.tasks, input, (task) => task.taskId, (task) => task.title, "task");
}

/** @param {ReturnType<typeof snapshotModel>} model */
function resolveColumn(model, input) {
    return resolveByIdOrName(model.columns, input, (column) => column.columnId, (column) => column.name, "column");
}

/** A priority level, or null for "none". */
function resolvePriority(model, input) {
    const text = String(input ?? "").trim().toLowerCase();
    if (text === "none" || text === "no priority") {
        return null;
    }
    return resolveByIdOrName(model.priorities(), input, (level) => level.priorityId, (level) => level.name, "priority");
}

function resolveLabel(model, input) {
    return resolveByIdOrName(model.labels(), input, (label) => label.labelId, (label) => label.name, "label");
}

/**
 * Autocomplete choices: up to 25 items whose name contains what was typed, those starting with it
 * first.
 */
function autocompleteChoices(items, typed, toChoice, nameOf) {
    const query = String(typed ?? "").trim().toLowerCase();
    return items
        .map((item) => ({ item, index: nameOf(item).toLowerCase().indexOf(query) }))
        .filter(({ index }) => !query || index >= 0)
        .sort((a, b) => (a.index === 0) === (b.index === 0) ? 0 : a.index === 0 ? -1 : 1)
        .slice(0, 25)
        .map(({ item }) => toChoice(item));
}

/** Reading helpers over a board snapshot. */
function snapshotModel(snapshot) {
    const byPosition = (a, b) => Number(a.position) - Number(b.position);
    const columns = [...snapshot.columns].sort(byPosition);
    const tasksIn = (columnId) => snapshot.tasks.filter((task) => task.columnId === columnId).sort(byPosition);
    const features = snapshot.features ?? {};
    const assignmentsOf = (task) => snapshot.assignments.filter((assignment) => assignment.taskId === task.taskId);
    const roleAssignmentsOf = (task) => (snapshot.roleAssignments ?? []).filter((role) => role.taskId === task.taskId);
    const taskLabelsOf = (task) => snapshot.taskLabels.filter((taskLabel) => taskLabel.taskId === task.taskId);

    return {
        board: snapshot.board,
        features,
        permissions: snapshot.permissions ?? {},
        columns,
        tasksIn,
        /** The board's priority levels, most urgent first. */
        priorities: () => [...snapshot.priorities].sort((a, b) => a.position - b.position),
        labels: () => [...snapshot.labels].sort((a, b) => a.name.localeCompare(b.name)),
        /** Assignment records, with the ids needed to remove them. */
        assignmentsOf,
        roleAssignmentsOf,
        taskLabelsOf,
        column: (columnId) => columns.find((column) => column.columnId === columnId) ?? null,
        task: (taskId) => snapshot.tasks.find((task) => task.taskId === taskId) ?? null,
        priorityOf: (task) =>
            features.PRIORITIES ? snapshot.priorities.find((level) => level.priorityId === task.priorityId) ?? null : null,
        labelsOf: (task) =>
            features.LABELS
                ? taskLabelsOf(task)
                    .map((taskLabel) => snapshot.labels.find((label) => label.labelId === taskLabel.labelId))
                    .filter(Boolean)
                : [],
        assigneesOf: (task) => (features.ASSIGNEES ? assignmentsOf(task).map((a) => String(a.userId)) : []),
        rolesOf: (task) => (features.ASSIGNEES ? roleAssignmentsOf(task).map((r) => String(r.roleId)) : []),
    };
}

module.exports = {
    listBoards,
    getSnapshot,
    forgetBoard,
    resolveBoard,
    resolveTask,
    resolveColumn,
    resolvePriority,
    resolveLabel,
    resolveByIdOrName,
    autocompleteChoices,
    snapshotModel,
};
