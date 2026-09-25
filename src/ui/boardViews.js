const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const { webAppUrl } = require("../config/env");
const { encode } = require("../utils/customId");
const { discordTime, fitLines, parseServerTime, plain, truncate } = require("../utils/format");
const { appendDivider, appendFooter, appendText, buildContainer } = require("./containers");

/** Tasks shown per column on the board overview, and per page in a column. */
const OVERVIEW_TASKS_PER_COLUMN = 5;
const COLUMN_PAGE_SIZE = 10;

function boardUrl(board, taskId) {
    const task = taskId ? `&task=${taskId}` : "";
    return `${webAppUrl}/boards/${board.boardId}?serverId=${board.serverId}${task}`;
}

function linkButton(label, url) {
    return new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url);
}

/** One line for a task in a list: title, then priority, due date and how many are assigned. */
function taskLine(model, task) {
    const parts = [plain(task.title, 80)];
    const priority = model.priorityOf(task);
    if (priority) {
        parts.push(plain(priority.name, 30));
    }
    const due = model.features.DUE_DATES ? parseServerTime(task.dueDate) : null;
    if (due) {
        parts.push(`due ${discordTime(due, "R")}`);
    }
    const people = model.assigneesOf(task).length + model.rolesOf(task).length;
    if (people > 0) {
        parts.push(`${people} assigned`);
    }
    return `- ${parts.join(" · ")}`;
}

/** /board list */
function buildBoardList(boards) {
    const container = buildContainer({ title: "Boards" });
    if (boards.length === 0) {
        appendText(container, "There are no boards you can see here yet. Create one on the website.");
        return container;
    }
    const lines = boards.map((board) => {
        const archived = board.isArchived ? " *(archived)*" : "";
        const description = board.description ? `\n-# ${plain(board.description, 120)}` : "";
        return `**${plain(board.name, 80)}**${archived}${description}`;
    });
    const { shown, omitted } = fitLines(lines, 3500);
    appendText(container, shown.join("\n"));
    if (omitted > 0) {
        appendFooter(container, `${omitted} more not shown; see them all on the website.`);
    }
    container.addActionRowComponents(new ActionRowBuilder().addComponents(linkButton("Open KanbanCord", webAppUrl)));
    return container;
}

/** /board view: every column with its first few tasks, and a menu to open a column. */
function buildBoardOverview(model) {
    const { board } = model;
    const container = buildContainer({
        title: `${plain(board.name, 80)}${board.isArchived ? " *(archived)*" : ""}`,
        body: board.description ? plain(board.description, 300) : undefined,
    });
    appendDivider(container);

    if (model.columns.length === 0) {
        appendText(container, "This board has no columns yet.");
    }
    const blocks = model.columns.map((column) => {
        const tasks = model.tasksIn(column.columnId);
        const lines = tasks.slice(0, OVERVIEW_TASKS_PER_COLUMN).map((task) => taskLine(model, task));
        if (tasks.length > OVERVIEW_TASKS_PER_COLUMN) {
            lines.push(`-# +${tasks.length - OVERVIEW_TASKS_PER_COLUMN} more`);
        }
        if (tasks.length === 0) {
            lines.push("-# Empty");
        }
        return `**${plain(column.name, 60)}** · ${tasks.length}\n${lines.join("\n")}`;
    });
    const { shown, omitted } = fitLines(blocks, 3200);
    if (shown.length > 0) {
        appendText(container, shown.join("\n\n"));
    }
    if (omitted > 0) {
        appendText(container, `-# ${omitted} more column${omitted === 1 ? "" : "s"} not shown; open one below.`);
    }

    const rows = [];
    if (model.columns.length > 0) {
        rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(encode("board", "column", board.boardId))
                .setPlaceholder("Open a column…")
                .addOptions(model.columns.slice(0, 25).map((column) => ({
                    label: truncate(column.name, 100),
                    description: `${model.tasksIn(column.columnId).length} tasks`,
                    value: String(column.columnId),
                }))),
        ));
    }
    rows.push(new ActionRowBuilder().addComponents(linkButton("Open on website", boardUrl(board))));
    container.addActionRowComponents(...rows);
    return container;
}

/** One column, a page at a time, with a menu to open a task. */
function buildColumnView(model, columnId, page) {
    const { board } = model;
    const column = model.column(columnId);
    const tasks = column ? model.tasksIn(columnId) : [];
    const pages = Math.max(1, Math.ceil(tasks.length / COLUMN_PAGE_SIZE));
    const current = Math.min(Math.max(0, page), pages - 1);
    const onPage = tasks.slice(current * COLUMN_PAGE_SIZE, (current + 1) * COLUMN_PAGE_SIZE);

    const container = buildContainer({
        title: `${plain(board.name, 60)} › ${column ? plain(column.name, 60) : "Missing column"}`,
    });
    appendText(container, `-# ${tasks.length} task${tasks.length === 1 ? "" : "s"}${pages > 1 ? ` · page ${current + 1} of ${pages}` : ""}`);
    if (!column) {
        appendText(container, "This column no longer exists.");
    } else if (onPage.length === 0) {
        appendText(container, "No tasks in this column.");
    } else {
        appendText(container, onPage.map((task) => taskLine(model, task)).join("\n"));
    }

    const rows = [];
    if (onPage.length > 0) {
        rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(encode("task", "open", board.boardId))
                .setPlaceholder("Open a task…")
                .addOptions(onPage.map((task) => ({ label: truncate(task.title, 100), value: String(task.taskId) }))),
        ));
    }
    rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(encode("board", "page", board.boardId, columnId, current - 1))
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Previous")
            .setDisabled(current === 0),
        new ButtonBuilder()
            .setCustomId(encode("board", "page", board.boardId, columnId, current + 1))
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Next")
            .setDisabled(current >= pages - 1),
        new ButtonBuilder()
            .setCustomId(encode("board", "open", board.boardId))
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Back to board"),
    ));
    container.addActionRowComponents(...rows);
    return container;
}

module.exports = {
    COLUMN_PAGE_SIZE,
    boardUrl,
    linkButton,
    buildBoardList,
    buildBoardOverview,
    buildColumnView,
};
