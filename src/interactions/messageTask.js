const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const { registerComponentHandler } = require("../utils/interactionRouter");
const { getSnapshot, listBoards, snapshotModel } = require("../services/boards/boardData");
const { findDraft } = require("../services/boards/messageTask");
const { appendFooter, buildContainer } = require("../ui/containers");
const { newTaskModal } = require("../ui/taskForm");
const { encode } = require("../utils/customId");
const { UserFacingError } = require("../utils/errorMessages");
const { plain, truncate } = require("../utils/format");

/**
 * "Create task" on a message: which board it goes on, then the usual new-task form with the message
 * filled in. The form is the board view's own, so the result is the same task view.
 */

const MENU_MAX = 25;
/** Boards posted in the channel get a button each, up to this many. */
const BUTTONS_MAX = 4;

/**
 * The boards a task could go on (active ones), and of those, the ones posted in this channel: the
 * likeliest home for a message from here.
 */
async function taskBoards(ctx) {
    const [all, postedHere] = await Promise.all([
        listBoards(ctx),
        ctx.api.get(`/channels/${ctx.interaction.channelId}/boards`).catch(() => ({ boardIds: [] })),
    ]);
    const boards = all.filter((board) => !board.isArchived);
    if (boards.length === 0) {
        throw new UserFacingError("No boards yet", "There is no board to add the task to. Create one with `/board create`.");
    }
    const ids = new Set((postedHere?.boardIds ?? []).map(String));
    return { boards, posted: boards.filter((board) => ids.has(String(board.boardId))) };
}

/** Opens the new-task form for the board, filled in from the message. Must be the first answer. */
async function openDraftForm(ctx, boardId, draft) {
    const model = snapshotModel(await getSnapshot(ctx, boardId));
    if (model.columns.length === 0) {
        throw new UserFacingError("No columns", "This board has no columns to add a task to yet.");
    }
    return ctx.showModal(newTaskModal({ customId: encode("brd", "task", boardId), model, chooseColumn: true, prefill: draft }));
}

/** Which board: a button for each board posted here, and a menu with every board. */
function boardPicker(draftId, draft, boards, posted) {
    const preview = draft.title || draft.description.split("\n")[0];
    const container = buildContainer({
        title: "Create a task from this message",
        body: `> ${plain(preview, 120)}\nWhich board should it go on?`,
    });
    if (posted.length > 0) {
        container.addActionRowComponents(new ActionRowBuilder().addComponents(posted.slice(0, BUTTONS_MAX).map((board) =>
            new ButtonBuilder()
                .setCustomId(encode("msgtask", "board", draftId, board.boardId))
                .setStyle(ButtonStyle.Primary)
                .setLabel(truncate(`Add to ${board.name}`, 80)))));
    }
    const postedIds = new Set(posted.map((board) => board.boardId));
    const ordered = [...posted, ...boards.filter((board) => !postedIds.has(board.boardId))].slice(0, MENU_MAX);
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(encode("msgtask", "pick", draftId))
        .setPlaceholder(posted.length > 0 ? "Or another board" : "Choose a board")
        .addOptions(ordered.map((board) => ({
            label: truncate(board.name, 100),
            value: String(board.boardId),
            description: postedIds.has(board.boardId) ? "Posted in this channel" : undefined,
        })))));
    const more = boards.length > MENU_MAX
        ? ` Only the first ${MENU_MAX} boards fit here; for another, use \`/task create\`.`
        : "";
    return appendFooter(container, `You can change the title and description before it is saved.${more}`);
}

registerComponentHandler("msgtask", async (ctx, { action, args }) => {
    const [draftId, buttonBoardId] = args;
    const draft = findDraft(draftId, ctx.user.id);
    if (!draft) {
        throw new UserFacingError("This has expired", "Use Create task on the message again.");
    }
    const boardId = action === "board" ? buttonBoardId : ctx.interaction.values?.[0];
    if (!boardId) {
        throw new UserFacingError("Not available", "That action is not available here.");
    }
    return openDraftForm(ctx, boardId, draft);
});

module.exports = { taskBoards, openDraftForm, boardPicker };
