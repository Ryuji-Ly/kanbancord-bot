const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MentionableSelectMenuBuilder,
    StringSelectMenuBuilder,
} = require("discord.js");
const { encode } = require("../utils/customId");
const { truncate } = require("../utils/format");
const { boardUrl, linkButton } = require("./boardViews");
const { threadButton } = require("./threadViews");
const { buildTaskCard } = require("./taskViews");

/**
 * The task card under an interactive feed post: the whole task, with controls to change it right
 * there. A feed post belongs to the channel, so the controls act as whoever uses them (with their
 * permissions) and the card is redrawn from the task as it is then, for everyone.
 */

/** With this many columns or fewer, each is a button; with more, a menu. Discord fits 5 buttons in a row. */
const COLUMN_BUTTONS_MAX = 5;
const MENU_MAX = 25;
/** Discord allows 25 people and roles in one picker. */
const ASSIGN_MAX = 25;

function moveRow(model, task) {
    const { boardId } = model.board;
    if (model.columns.length <= 1) {
        return null;
    }
    if (model.columns.length <= COLUMN_BUTTONS_MAX) {
        // Every column, the task's own one lit and disabled, so the row also shows where it is.
        return new ActionRowBuilder().addComponents(model.columns.map((column) => new ButtonBuilder()
            .setCustomId(encode("feed", "move", boardId, task.taskId, column.columnId))
            .setStyle(column.columnId === task.columnId ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setLabel(truncate(column.name, 80))
            .setDisabled(column.columnId === task.columnId)));
    }
    return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(encode("feed", "moveto", boardId, task.taskId))
        .setPlaceholder("Move to…")
        .addOptions(model.columns.slice(0, MENU_MAX).map((column) => ({
            label: truncate(column.name, 100),
            value: String(column.columnId),
            default: column.columnId === task.columnId,
        }))));
}

/** One picker for people and roles, showing who is assigned now; unpicking someone unassigns them. */
function assignRow(model, task) {
    if (!model.features.ASSIGNEES) {
        return null;
    }
    const select = new MentionableSelectMenuBuilder()
        .setCustomId(encode("feed", "assign", model.board.boardId, task.taskId))
        .setPlaceholder("Assign people or roles…")
        .setMinValues(0)
        .setMaxValues(ASSIGN_MAX);
    const users = model.assigneesOf(task).slice(0, ASSIGN_MAX);
    const roles = model.rolesOf(task).slice(0, ASSIGN_MAX - users.length);
    if (users.length > 0) {
        select.addDefaultUsers(users);
    }
    if (roles.length > 0) {
        select.addDefaultRoles(roles);
    }
    return new ActionRowBuilder().addComponents(select);
}

function buttonsRow(model, task) {
    const { boardId } = model.board;
    const button = (action, label, style = ButtonStyle.Secondary) =>
        new ButtonBuilder().setCustomId(encode("feed", action, boardId, task.taskId)).setStyle(style).setLabel(label);
    const buttons = [];
    if (!model.board.isArchived) {
        buttons.push(button("edit", "Edit"));
    }
    buttons.push(button("follow", "Follow"), button("more", "More…"));
    const thread = threadButton(model, task);
    if (thread) {
        buttons.push(thread);
    }
    if (buttons.length < 5) {
        buttons.push(linkButton("Open on website", boardUrl(model.board, task.taskId)));
    }
    return new ActionRowBuilder().addComponents(buttons);
}

/**
 * The card and its controls. An archived board cannot be changed, so it only offers following and
 * the full view.
 */
function buildFeedCard(model, task) {
    const container = buildTaskCard(model, task);
    const rows = model.board.isArchived ? [] : [moveRow(model, task), assignRow(model, task)];
    rows.push(buttonsRow(model, task));
    container.addActionRowComponents(...rows.filter(Boolean));
    return container;
}

module.exports = { buildFeedCard };
