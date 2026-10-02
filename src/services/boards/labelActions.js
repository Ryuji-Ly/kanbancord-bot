const { UserFacingError } = require("../../utils/errorMessages");
const { nextColor } = require("../../utils/colors");
const { plain } = require("../../utils/format");
const { forgetBoard, getSnapshot, snapshotModel } = require("./boardData");

/**
 * Changes to a board's labels and priority levels, made as the user. The API checks permissions
 * and whether the feature is on; these only shape the requests and catch mistakes early, with a
 * clearer message than the API's. Each returns what the reply should say.
 */

const NAME_MAX = 50;

async function currentModel(ctx, boardId) {
    return snapshotModel(await getSnapshot(ctx, boardId, { fresh: true }));
}

function requireFeature(model, feature, what) {
    if (!model.features[feature]) {
        throw new UserFacingError(
            `${what} are switched off`,
            `${what} are switched off for this board. A server manager can turn them on in the board's settings on the website.`,
        );
    }
}

function cleanName(name) {
    const text = String(name ?? "").trim().slice(0, NAME_MAX);
    if (!text) {
        throw new UserFacingError("Name needed", "Give it a name.");
    }
    return text;
}

/** Two labels or two levels with the same name would be impossible to tell apart. */
function requireUniqueName(items, name, kind, exceptId, idOf) {
    const taken = items.find((item) => item.name.toLowerCase() === name.toLowerCase() && idOf(item) !== exceptId);
    if (taken) {
        throw new UserFacingError("Name taken", `This board already has a ${kind} called **${plain(taken.name, 60)}**.`);
    }
}

function after(ctx, boardId, result) {
    forgetBoard(ctx, boardId);
    return result;
}

// ── Labels ───────────────────────────────────────────────────────────────────

const labelId = (label) => label.labelId;

function requireLabel(model, id) {
    const label = model.labels().find((entry) => entry.labelId === Number(id));
    if (!label) {
        throw new UserFacingError("Label not found", "That label no longer exists.");
    }
    return label;
}

/** A label with the given colour, or the palette colour the board uses least. */
async function createLabel(ctx, boardId, { name, color }) {
    const model = await currentModel(ctx, boardId);
    requireFeature(model, "LABELS", "Labels");
    const clean = cleanName(name);
    requireUniqueName(model.labels(), clean, "label", null, labelId);
    const label = await ctx.api.post(`/boards/${boardId}/labels`, {
        body: { name: clean, boardId: Number(boardId), color: color ?? nextColor(model.labels().map((entry) => entry.color)) },
    });
    return after(ctx, boardId, { labelId: label.labelId, notice: `Created label **${plain(label.name ?? clean, 60)}**` });
}

async function editLabel(ctx, boardId, id, { name, color }) {
    if (name === undefined && color === undefined) {
        throw new UserFacingError("Nothing to change", "Give a new name, a new colour, or both.");
    }
    const model = await currentModel(ctx, boardId);
    requireFeature(model, "LABELS", "Labels");
    const label = requireLabel(model, id);
    const newName = name === undefined ? label.name : cleanName(name);
    requireUniqueName(model.labels(), newName, "label", label.labelId, labelId);
    await ctx.api.put(`/boards/${boardId}/labels/${label.labelId}`, {
        body: { name: newName, boardId: Number(boardId), color: color ?? label.color },
    });
    const renamed = newName !== label.name ? ` to **${plain(newName, 60)}**` : "";
    return after(ctx, boardId, { notice: `Updated label **${plain(label.name, 60)}**${renamed}` });
}

async function deleteLabel(ctx, boardId, id) {
    const label = requireLabel(await currentModel(ctx, boardId), id);
    await ctx.api.delete(`/boards/${boardId}/labels/${label.labelId}`);
    return after(ctx, boardId, { notice: `Deleted label **${plain(label.name, 60)}**` });
}

// ── Priority levels ──────────────────────────────────────────────────────────

const priorityId = (level) => level.priorityId;

function requireLevel(model, id) {
    const level = model.priorities().find((entry) => entry.priorityId === Number(id));
    if (!level) {
        throw new UserFacingError("Priority not found", "That priority level no longer exists.");
    }
    return level;
}

/** 1 is the most urgent; positions past the end mean the end. */
function indexFor(position, count) {
    return Math.min(Math.max(1, position), Math.max(1, count)) - 1;
}

/**
 * A new level, at the bottom of the list unless a position is given. Without a colour the API
 * uses a neutral grey, which suits a level better than a label's bright colours.
 */
async function createPriority(ctx, boardId, { name, color, position }) {
    const model = await currentModel(ctx, boardId);
    requireFeature(model, "PRIORITIES", "Priorities");
    const clean = cleanName(name);
    requireUniqueName(model.priorities(), clean, "priority level", null, priorityId);
    const body = { name: clean };
    if (color) {
        body.color = color;
    }
    const level = await ctx.api.post(`/boards/${boardId}/priorities`, { body });
    const count = model.priorities().length + 1;
    if (position !== undefined && indexFor(position, count) !== count - 1) {
        await ctx.api.post(`/boards/${boardId}/priorities/${level.priorityId}/move`, { body: { index: indexFor(position, count) } });
    }
    return after(ctx, boardId, { priorityId: level.priorityId, notice: `Created priority **${plain(level.name ?? clean, 60)}**` });
}

async function editPriority(ctx, boardId, id, { name, color }) {
    if (name === undefined && color === undefined) {
        throw new UserFacingError("Nothing to change", "Give a new name, a new colour, or both.");
    }
    const model = await currentModel(ctx, boardId);
    requireFeature(model, "PRIORITIES", "Priorities");
    const level = requireLevel(model, id);
    const newName = name === undefined ? level.name : cleanName(name);
    requireUniqueName(model.priorities(), newName, "priority level", level.priorityId, priorityId);
    // The colour is always sent: leaving it out would reset it to grey.
    await ctx.api.put(`/boards/${boardId}/priorities/${level.priorityId}`, { body: { name: newName, color: color ?? level.color } });
    const renamed = newName !== level.name ? ` to **${plain(newName, 60)}**` : "";
    return after(ctx, boardId, { notice: `Updated priority **${plain(level.name, 60)}**${renamed}` });
}

/** @param {number} position 1 is the most urgent */
async function movePriority(ctx, boardId, id, position) {
    const model = await currentModel(ctx, boardId);
    requireFeature(model, "PRIORITIES", "Priorities");
    const level = requireLevel(model, id);
    const index = indexFor(position, model.priorities().length);
    await ctx.api.post(`/boards/${boardId}/priorities/${level.priorityId}/move`, { body: { index } });
    return after(ctx, boardId, { notice: `Moved **${plain(level.name, 60)}** to position ${index + 1}` });
}

async function deletePriority(ctx, boardId, id) {
    const level = requireLevel(await currentModel(ctx, boardId), id);
    await ctx.api.delete(`/boards/${boardId}/priorities/${level.priorityId}`);
    return after(ctx, boardId, { notice: `Deleted priority **${plain(level.name, 60)}**` });
}

module.exports = {
    createLabel,
    editLabel,
    deleteLabel,
    createPriority,
    editPriority,
    movePriority,
    deletePriority,
};
