const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MediaGalleryBuilder } = require("discord.js");
const { encode } = require("../utils/customId");
const { describeMarkdown, discordTime, parseServerTime, plain, truncate } = require("../utils/format");
const { appendDivider, appendFooter, appendText, buildContainer } = require("./containers");
const { boardUrl, linkButton } = require("./boardViews");
const { actionsRow } = require("./taskPanels");

/** Discord shows at most 10 items in a gallery. */
const MAX_MEDIA = 10;

/**
 * /task view: every field the board has switched on, the description, and its images. With
 * `abilities`, a menu offers the changes the viewer may make.
 *
 * @param {{ abilities?: object, userId?: string }} [viewer]
 */
function buildTaskView(model, task, { abilities, userId } = {}) {
    const { board, features } = model;
    const column = model.column(task.columnId);
    const container = buildContainer({ title: plain(task.title, 200) });
    appendText(container, `-# ${plain(board.name, 60)} › ${column ? plain(column.name, 60) : "?"}`);

    const fields = [];
    const priority = model.priorityOf(task);
    if (priority) {
        fields.push(`**Priority** ${plain(priority.name, 40)}`);
    }
    const labels = model.labelsOf(task);
    if (labels.length > 0) {
        // Inside code formatting nothing needs escaping; only backticks would end it early.
        fields.push(`**Labels** ${labels.map((label) => `\`${truncate(label.name.replace(/`/g, "'"), 40)}\``).join(" ")}`);
    }
    const people = [
        ...model.assigneesOf(task).map((id) => `<@${id}>`),
        ...model.rolesOf(task).map((id) => `<@&${id}>`),
    ];
    if (features.ASSIGNEES) {
        fields.push(`**Assigned** ${people.length > 0 ? people.join(" ") : "nobody"}`);
    }
    const due = features.DUE_DATES ? parseServerTime(task.dueDate) : null;
    if (due) {
        fields.push(`**Due** ${discordTime(due, "f")} (${discordTime(due, "R")})`);
    }
    if (fields.length > 0) {
        appendText(container, fields.join("\n"));
    }

    const { text, media } = describeMarkdown(task.description, 2500);
    if (text || media.length > 0) {
        appendDivider(container);
    }
    if (text) {
        appendText(container, text);
    }
    if (media.length > 0) {
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
            media.slice(0, MAX_MEDIA).map(({ url, description }) => (item) => {
                item.setURL(url);
                if (description) {
                    item.setDescription(description.slice(0, 1024));
                }
                return item;
            }),
        ));
    }

    const created = parseServerTime(task.createdAt);
    const meta = [];
    if (task.createdBy) {
        meta.push(`Created by <@${task.createdBy}>${created ? ` ${discordTime(created, "R")}` : ""}`);
    }
    const updated = parseServerTime(task.updatedAt);
    if (updated && (!created || updated.getTime() - created.getTime() > 60_000)) {
        meta.push(`updated ${discordTime(updated, "R")}`);
    }
    if (meta.length > 0) {
        appendFooter(container, meta.join(" · "));
    }

    const buttons = [];
    if (features.COMMENTS) {
        buttons.push(new ButtonBuilder()
            .setCustomId(encode("comment", "page", board.boardId, task.taskId, 0))
            .setStyle(ButtonStyle.Primary)
            .setLabel("Comments"));
    }
    if (column) {
        buttons.push(new ButtonBuilder()
            .setCustomId(encode("board", "page", board.boardId, column.columnId, 0))
            .setStyle(ButtonStyle.Secondary)
            .setLabel(`Back to ${column.name}`.slice(0, 80)));
    }
    buttons.push(linkButton("Open on website", boardUrl(board, task.taskId)));
    const actions = abilities ? actionsRow(model, task, abilities, userId) : null;
    if (actions) {
        container.addActionRowComponents(actions);
    }
    container.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
    return container;
}

module.exports = { buildTaskView };
