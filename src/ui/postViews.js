const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require("discord.js");
const { encode } = require("../utils/customId");
const { discordTime, fitLines, plain, truncate } = require("../utils/format");
const { boardUrl, linkButton, taskLine } = require("./boardViews");
const { appendDivider, appendFooter, appendText, buildContainer, infoContainer, warningContainer } = require("./containers");
const { newTaskModal } = require("./taskForm");
const { COLORS } = require("./theme");

/**
 * Board posts: a whole board in one channel message, edited whenever the board changes. Everything
 * on it opens privately for whoever clicks, so a channel can hold several posts without any of them
 * changing for one person.
 */

/** Tasks shown per column; the rest are counted. The whole post must stay under Discord's limit. */
const TASKS_PER_COLUMN = 10;
const TEXT_BUDGET = 3300;
/** Discord's limit on options in a menu. */
const MENU_MAX = 25;

/** The board as a post shows it, with menus to open a column or a task and a button to add one. */
function buildBoardPost(model, { now = new Date() } = {}) {
    const { board } = model;
    const container = buildContainer({
        title: `${plain(board.name, 80)}${board.isArchived ? " *(archived)*" : ""}`,
        body: board.description ? plain(board.description, 300) : undefined,
    });
    appendDivider(container);

    const blocks = model.columns.map((column) => {
        const tasks = model.tasksIn(column.columnId);
        const lines = tasks.slice(0, TASKS_PER_COLUMN).map((task) => taskLine(model, task));
        if (tasks.length > TASKS_PER_COLUMN) {
            lines.push(`-# +${tasks.length - TASKS_PER_COLUMN} more`);
        }
        if (tasks.length === 0) {
            lines.push("-# Empty");
        }
        return `**${plain(column.name, 60)}** · ${tasks.length}\n${lines.join("\n")}`;
    });
    if (blocks.length === 0) {
        appendText(container, "This board has no columns yet.");
    }
    const { shown, omitted } = fitLines(blocks, TEXT_BUDGET);
    if (shown.length > 0) {
        appendText(container, shown.join("\n\n"));
    }
    if (omitted > 0) {
        appendText(container, `-# ${omitted} more column${omitted === 1 ? "" : "s"} not shown; open one below.`);
    }

    const rows = [];
    if (model.columns.length > 0) {
        rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId(encode("post", "column", board.boardId))
            .setPlaceholder("Open a column…")
            .addOptions(model.columns.slice(0, MENU_MAX).map((column) => ({
                label: truncate(column.name, 100),
                description: `${model.tasksIn(column.columnId).length} tasks`,
                value: String(column.columnId),
            })))));
    }
    // The tasks in board order, as far as a menu holds them; the rest are a column away.
    const tasks = model.columns.flatMap((column) => model.tasksIn(column.columnId).map((task) => ({ task, column })));
    if (tasks.length > 0) {
        rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId(encode("post", "task", board.boardId))
            .setPlaceholder(tasks.length > MENU_MAX ? `Open a task… (first ${MENU_MAX}; more in each column)` : "Open a task…")
            .addOptions(tasks.slice(0, MENU_MAX).map(({ task, column }) => ({
                label: truncate(task.title, 100),
                description: truncate(column.name, 100),
                value: String(task.taskId),
            })))));
    }
    const buttons = [];
    if (!board.isArchived && model.columns.length > 0) {
        buttons.push(new ButtonBuilder()
            .setCustomId(encode("post", "add", board.boardId))
            .setStyle(ButtonStyle.Primary)
            .setLabel("Add task"));
    }
    buttons.push(linkButton("Open on website", boardUrl(board)));
    rows.push(new ActionRowBuilder().addComponents(...buttons));
    container.addActionRowComponents(...rows);

    appendFooter(container, `Updates by itself · last updated ${discordTime(now, "R")}`);
    return container;
}

/** What a post becomes once its board is deleted: it stays, but says so and offers nothing. */
function buildDeletedPost() {
    return buildContainer({
        title: "Board deleted",
        body: "The board this post showed has been deleted, so it no longer updates.",
        accent: COLORS.warning,
    });
}

/**
 * The new-task form from a post: like /task create's, and asking which column it goes in, since a
 * post is not about one column.
 */
function postTaskModal(model) {
    return newTaskModal({ customId: encode("post", "create", model.board.boardId), model, chooseColumn: true });
}

/**
 * Asks before posting a board to a channel whose members are not all allowed to see it. Names the
 * first few, without pinging them.
 */
function audienceWarning(boardId, boardName, { hidden, hiddenUserIds }) {
    const named = hiddenUserIds.map((id) => `<@${id}>`).join(", ");
    const others = hidden - hiddenUserIds.length;
    const who = others > 0 ? `${named} and ${others} more` : named;
    const container = warningContainer(
        "Show this board to more people?",
        `**${hidden} ${hidden === 1 ? "person" : "people"}** who can see this channel cannot see **${plain(boardName, 80)}** `
            + `on the website: ${who}.\nA post shows the whole board to everyone here, and anyone allowed to change it can `
            + "do so from the post.",
    );
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(encode("post", "confirm", boardId)).setStyle(ButtonStyle.Primary).setLabel("Post anyway"),
        new ButtonBuilder().setCustomId(encode("post", "cancel", boardId)).setStyle(ButtonStyle.Secondary).setLabel("Cancel"),
    ));
    return container;
}

function postedNotice(boardName) {
    return infoContainer(
        "Board posted",
        `**${plain(boardName, 80)}** is posted here and updates itself whenever the board changes. Anyone can open its `
            + "columns and tasks; what they can change depends on their own permissions. To stop it, delete the message.",
    );
}

module.exports = { buildBoardPost, buildDeletedPost, postTaskModal, audienceWarning, postedNotice };
