const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    LabelBuilder,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require("discord.js");
const { webAppUrl } = require("../config/env");
const { encode } = require("../utils/customId");
const { discordTime, fitLines, parseServerTime, plain, truncate } = require("../utils/format");
const { appendDivider, appendFooter, appendText, buildContainer, warningContainer } = require("./containers");

/** Tasks shown per column on the board overview, and per page in a column. */
const OVERVIEW_TASKS_PER_COLUMN = 5;
const COLUMN_PAGE_SIZE = 10;
/** Discord shows at most 25 options in a menu. */
const MENU_MAX = 25;

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

/** A button whose permission is checked when it is used, like every other control in the views. */
function actionButton(label, feature, action, ...args) {
    return new ButtonBuilder().setCustomId(encode(feature, action, ...args)).setStyle(ButtonStyle.Secondary).setLabel(label);
}

/** /board list: every board, a menu to open one, and a button to create one. */
function buildBoardList(boards) {
    const container = buildContainer({ title: "Boards" });
    const rows = [];
    if (boards.length === 0) {
        appendText(container, "There are no boards you can see here yet. Create one below, or with `/board create`.");
    } else {
        rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId(encode("board", "pick"))
            .setPlaceholder(boards.length > MENU_MAX ? `Open a board… (first ${MENU_MAX})` : "Open a board…")
            .addOptions(boards.slice(0, MENU_MAX).map((board) => ({
                label: truncate(`${board.name}${board.isArchived ? " (archived)" : ""}`, 100),
                description: board.description ? truncate(board.description.replace(/\s+/g, " "), 100) : undefined,
                value: String(board.boardId),
            })))));
    }
    rows.push(new ActionRowBuilder().addComponents(
        actionButton("Create board", "board", "new").setStyle(ButtonStyle.Primary),
        linkButton("Open KanbanCord", webAppUrl),
    ));
    if (boards.length === 0) {
        container.addActionRowComponents(...rows);
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
    container.addActionRowComponents(...rows);
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
                .addOptions(model.columns.slice(0, MENU_MAX).map((column) => ({
                    label: truncate(column.name, 100),
                    description: `${model.tasksIn(column.columnId).length} tasks`,
                    value: String(column.columnId),
                }))),
        ));
    }
    // The tasks in board order, as far as a menu holds them; the rest are a column away.
    const tasks = model.columns.flatMap((column) => model.tasksIn(column.columnId).map((task) => ({ task, column })));
    if (tasks.length > 0) {
        rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId(encode("task", "open", board.boardId))
            .setPlaceholder(tasks.length > MENU_MAX ? `Open a task… (first ${MENU_MAX}; more in each column)` : "Open a task…")
            .addOptions(tasks.slice(0, MENU_MAX).map(({ task, column }) => ({
                label: truncate(task.title, 100),
                description: truncate(column.name, 100),
                value: String(task.taskId),
            })))));
    }
    // An archived board cannot be changed by anyone until it is restored.
    const locked = Boolean(board.isArchived);
    rows.push(new ActionRowBuilder().addComponents(
        actionButton("Add task", "board", "addtask", board.boardId)
            .setStyle(ButtonStyle.Primary).setDisabled(locked || model.columns.length === 0),
        actionButton("Add column", "board", "addcol", board.boardId).setDisabled(locked),
        actionButton("Edit board", "board", "edit", board.boardId).setDisabled(locked),
        actionButton("All boards", "board", "list"),
        linkButton("Open on website", boardUrl(board)),
    ));
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
    if (column && model.columns.length > 1) {
        const position = model.columns.findIndex((entry) => entry.columnId === column.columnId);
        rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId(encode("col", "move", board.boardId, column.columnId))
            .setPlaceholder("Move this column…")
            .setDisabled(Boolean(board.isArchived))
            .addOptions(model.columns.slice(0, MENU_MAX).map((entry, index) => ({
                label: `Position ${index + 1}${index === position ? " (here now)" : ""}`,
                description: index === position ? undefined : truncate(`${index < position ? "Before" : "After"} ${entry.name}`, 100),
                value: String(index + 1),
                default: index === position,
            })))));
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
    if (column) {
        const locked = Boolean(board.isArchived);
        rows.push(new ActionRowBuilder().addComponents(
            actionButton("Add task here", "col", "addtask", board.boardId, column.columnId)
                .setStyle(ButtonStyle.Primary).setDisabled(locked),
            actionButton("Rename column", "col", "rename", board.boardId, column.columnId).setDisabled(locked),
            actionButton("Delete column", "col", "ask", board.boardId, column.columnId)
                .setStyle(ButtonStyle.Danger).setDisabled(locked),
        ));
    }
    container.addActionRowComponents(...rows);
    return container;
}

/** Asks before deleting a column, saying how many tasks go with it. */
function columnDeletePanel(boardId, column, taskCount) {
    const tasks = taskCount > 0 ? ` and its ${taskCount} task${taskCount === 1 ? "" : "s"}` : "";
    const container = warningContainer(
        "Delete this column?",
        `**${plain(column.name, 60)}**${tasks} will be deleted for everyone. This cannot be undone.`,
    );
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(encode("col", "delete", boardId, column.columnId))
            .setStyle(ButtonStyle.Danger)
            .setLabel("Delete column"),
        new ButtonBuilder()
            .setCustomId(encode("board", "open", boardId))
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Cancel"),
    ));
    return container;
}

function textField(id, label, { max, value, required = true, paragraph = false } = {}) {
    const input = new TextInputBuilder()
        .setCustomId(id).setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(required);
    if (max) {
        input.setMaxLength(max);
    }
    if (value) {
        input.setValue(String(value).slice(0, max ?? 4000));
    }
    return new LabelBuilder().setLabel(label).setTextInputComponent(input);
}

function boardCreateModal() {
    return new ModalBuilder()
        .setCustomId(encode("brd", "create"))
        .setTitle("New board")
        .addLabelComponents(
            textField("name", "Name", { max: 100 }),
            textField("description", "Description", { max: 500, required: false, paragraph: true }),
        );
}

function columnCreateModal(boardId) {
    return new ModalBuilder()
        .setCustomId(encode("brd", "column", boardId))
        .setTitle("New column")
        .addLabelComponents(textField("name", "Name", { max: 50 }));
}

function columnRenameModal(boardId, column) {
    return new ModalBuilder()
        .setCustomId(encode("col", "rename", boardId, column.columnId))
        .setTitle("Rename column")
        .addLabelComponents(textField("name", "Name", { max: 50, value: column.name }));
}

function boardEditModal(board) {
    const name = new TextInputBuilder()
        .setCustomId("name").setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true).setValue(board.name);
    const description = new TextInputBuilder()
        .setCustomId("description").setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(false);
    if (board.description) {
        description.setValue(board.description);
    }
    return new ModalBuilder()
        .setCustomId(encode("brd", "edit", board.boardId))
        .setTitle("Edit board")
        .addLabelComponents(
            new LabelBuilder().setLabel("Name").setTextInputComponent(name),
            new LabelBuilder().setLabel("Description").setTextInputComponent(description),
        );
}

module.exports = {
    COLUMN_PAGE_SIZE,
    columnDeletePanel,
    boardCreateModal,
    boardEditModal,
    columnCreateModal,
    columnRenameModal,
    boardUrl,
    linkButton,
    taskLine,
    buildBoardList,
    buildBoardOverview,
    buildColumnView,
};
