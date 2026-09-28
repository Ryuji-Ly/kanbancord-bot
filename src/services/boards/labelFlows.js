const { buildLabelList, buildPriorityList, labelDeletePanel, priorityDeletePanel } = require("../../ui/labelViews");
const { successContainer } = require("../../ui/containers");
const { parseColor } = require("../../utils/colors");
const actions = require("./labelActions");
const { getSnapshot, resolveBoard, resolveLabel, resolveByIdOrName, snapshotModel } = require("./boardData");

/**
 * What /label and /priority do, given their options. Every reply shows the board's list as it is
 * afterwards, visible to the channel, with a line saying what changed.
 */

async function boardModel(ctx, boardId) {
    return snapshotModel(await getSnapshot(ctx, boardId, { fresh: true }));
}

async function chosenBoard(ctx) {
    const board = await resolveBoard(ctx, ctx.interaction.options.getString("board", true));
    return { board, model: await boardModel(ctx, board.boardId) };
}

/** The colour option, if given, as "#rrggbb". */
function colorOption(ctx) {
    const input = ctx.interaction.options.getString("color");
    return input ? parseColor(input) : undefined;
}

/** The name option, or undefined when it was left out. */
function nameOption(ctx, name = "name") {
    return ctx.interaction.options.getString(name) ?? undefined;
}

const withNotice = (notice, view) => (notice ? [successContainer(null, notice), view] : view);

async function labelListView(ctx, boardId, notice) {
    return withNotice(notice, buildLabelList(await boardModel(ctx, boardId)));
}

async function priorityListView(ctx, boardId, notice) {
    return withNotice(notice, buildPriorityList(await boardModel(ctx, boardId)));
}

/** A priority level by id (from autocomplete) or typed name. */
function resolveLevel(model, input) {
    return resolveByIdOrName(model.priorities(), input, (level) => level.priorityId, (level) => level.name, "priority level");
}

// ── /label ───────────────────────────────────────────────────────────────────

async function labelList(ctx) {
    await ctx.defer();
    const { board } = await chosenBoard(ctx);
    await ctx.reply(await labelListView(ctx, board.boardId));
}

async function labelCreate(ctx) {
    const color = colorOption(ctx);
    await ctx.defer();
    const { board } = await chosenBoard(ctx);
    const result = await actions.createLabel(ctx, board.boardId, { name: nameOption(ctx), color });
    await ctx.reply(await labelListView(ctx, board.boardId, result.notice));
}

async function labelEdit(ctx) {
    const color = colorOption(ctx);
    await ctx.defer();
    const { board, model } = await chosenBoard(ctx);
    const label = resolveLabel(model, ctx.interaction.options.getString("label", true));
    const result = await actions.editLabel(ctx, board.boardId, label.labelId, { name: nameOption(ctx), color });
    await ctx.reply(await labelListView(ctx, board.boardId, result.notice));
}

/** Asks first, saying how many tasks lose the label. */
async function labelDelete(ctx) {
    await ctx.defer();
    const { model } = await chosenBoard(ctx);
    const label = resolveLabel(model, ctx.interaction.options.getString("label", true));
    await ctx.reply(labelDeletePanel(model, label));
}

// ── /priority ────────────────────────────────────────────────────────────────

async function priorityList(ctx) {
    await ctx.defer();
    const { board } = await chosenBoard(ctx);
    await ctx.reply(await priorityListView(ctx, board.boardId));
}

async function priorityCreate(ctx) {
    const color = colorOption(ctx);
    await ctx.defer();
    const { board } = await chosenBoard(ctx);
    const position = ctx.interaction.options.getInteger("position") ?? undefined;
    const result = await actions.createPriority(ctx, board.boardId, { name: nameOption(ctx), color, position });
    await ctx.reply(await priorityListView(ctx, board.boardId, result.notice));
}

async function priorityEdit(ctx) {
    const color = colorOption(ctx);
    await ctx.defer();
    const { board, model } = await chosenBoard(ctx);
    const level = resolveLevel(model, ctx.interaction.options.getString("priority", true));
    const result = await actions.editPriority(ctx, board.boardId, level.priorityId, { name: nameOption(ctx), color });
    await ctx.reply(await priorityListView(ctx, board.boardId, result.notice));
}

async function priorityMove(ctx) {
    await ctx.defer();
    const { board, model } = await chosenBoard(ctx);
    const level = resolveLevel(model, ctx.interaction.options.getString("priority", true));
    const result = await actions.movePriority(ctx, board.boardId, level.priorityId, ctx.interaction.options.getInteger("position", true));
    await ctx.reply(await priorityListView(ctx, board.boardId, result.notice));
}

/** Asks first, saying how many tasks lose their priority. */
async function priorityDelete(ctx) {
    await ctx.defer();
    const { model } = await chosenBoard(ctx);
    const level = resolveLevel(model, ctx.interaction.options.getString("priority", true));
    await ctx.reply(priorityDeletePanel(model, level));
}

module.exports = {
    labelListView,
    priorityListView,
    labelList,
    labelCreate,
    labelEdit,
    labelDelete,
    priorityList,
    priorityCreate,
    priorityEdit,
    priorityMove,
    priorityDelete,
};
