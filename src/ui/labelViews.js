const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { colorDot } = require("../utils/colors");
const { encode } = require("../utils/customId");
const { fitLines, plain } = require("../utils/format");
const { boardUrl, linkButton } = require("./boardViews");
const { appendFooter, appendText, buildContainer, warningContainer } = require("./containers");

/** A board's labels and priority levels, and the confirmations before deleting one. */

const tasksText = (count) => `${count} task${count === 1 ? "" : "s"}`;

/**
 * How far a label's tasks are: done (in the board's last column, or archived) out of all of them, and who still
 * has the open ones. Archived tasks are not in the snapshot, but their labels are: a label on a task the snapshot
 * does not have is on an archived task.
 * @returns {{ total: number, done: number, people: Array<[string, number]>, unassigned: number }}
 */
function labelProgress(model, labelId) {
    const onBoard = new Map(model.tasks.map((task) => [task.taskId, task]));
    const lastColumn = model.columns.at(-1)?.columnId;
    let total = 0;
    let done = 0;
    let unassigned = 0;
    const people = new Map();
    for (const taskLabel of model.taskLabels) {
        if (taskLabel.labelId !== labelId) {
            continue;
        }
        total++;
        const task = onBoard.get(taskLabel.taskId);
        if (!task || task.columnId === lastColumn) {
            done++;
            continue;
        }
        const assignees = model.assigneesOf(task);
        if (assignees.length === 0) {
            unassigned++;
        }
        for (const userId of assignees) {
            people.set(userId, (people.get(userId) ?? 0) + 1);
        }
    }
    return { total, done, people: [...people].sort((a, b) => b[1] - a[1]), unassigned };
}

/** "7 of 12 done · open: @Sam 3, @Alex 2, 1 unassigned", or "no tasks yet". Mentions in views never ping. */
function progressText(model, labelId) {
    const { total, done, people, unassigned } = labelProgress(model, labelId);
    if (total === 0) {
        return "no tasks yet";
    }
    const open = [
        ...people.slice(0, 5).map(([userId, count]) => `<@${userId}> ${count}`),
        ...(people.length > 5 ? [`${people.length - 5} more`] : []),
        ...(model.features.ASSIGNEES && unassigned > 0 ? [`${unassigned} unassigned`] : []),
    ];
    const rest = total - done;
    return `${done} of ${total} done${rest > 0 && open.length > 0 ? ` · open: ${open.join(", ")}` : ""}`;
}

function listOf(container, lines, empty) {
    if (lines.length === 0) {
        appendText(container, empty);
        return;
    }
    const { shown, omitted } = fitLines(lines, 3400);
    appendText(container, shown.join("\n"));
    if (omitted > 0) {
        appendText(container, `-# ${omitted} more not shown; see them all on the website.`);
    }
}

function switchedOff(container, model, feature, what) {
    if (!model.features[feature]) {
        appendText(container, `-# ${what} are switched off for this board, so tasks do not show them. A server manager can turn them on in the board's settings on the website.`);
    }
}

/** /label list: every label with its colour, how many of its tasks are done and who has the open ones. */
function buildLabelList(model) {
    const { board } = model;
    const container = buildContainer({ title: `Labels · ${plain(board.name, 80)}` });
    switchedOff(container, model, "LABELS", "Labels");
    const lines = model.labels().map((label) =>
        `${colorDot(label.color)} **${plain(label.name, 60)}** · ${progressText(model, label.labelId)}`);
    listOf(container, lines, "This board has no labels yet. Add one with `/label create`.");
    appendFooter(container, "/label create · /label edit · /label delete · /task label to put one on a task");
    container.addActionRowComponents(new ActionRowBuilder().addComponents(linkButton("Open on website", boardUrl(board))));
    return container;
}

/** /priority list: the levels, most urgent first. */
function buildPriorityList(model) {
    const { board } = model;
    const container = buildContainer({ title: `Priorities · ${plain(board.name, 80)}` });
    switchedOff(container, model, "PRIORITIES", "Priorities");
    const lines = model.priorities().map((level, index) => {
        const used = model.tasks.filter((task) => task.priorityId === level.priorityId).length;
        return `${index + 1}. ${colorDot(level.color)} **${plain(level.name, 60)}** · ${tasksText(used)}`;
    });
    listOf(container, lines, "This board has no priority levels. Add one with `/priority create`.");
    appendFooter(container, "Most urgent first · /priority create · /priority edit · /priority move · /priority delete");
    container.addActionRowComponents(new ActionRowBuilder().addComponents(linkButton("Open on website", boardUrl(board))));
    return container;
}

function deletePanel(title, body, confirm, cancel, confirmLabel) {
    const container = warningContainer(title, body);
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(confirm).setStyle(ButtonStyle.Danger).setLabel(confirmLabel),
        new ButtonBuilder().setCustomId(cancel).setStyle(ButtonStyle.Secondary).setLabel("Cancel"),
    ));
    return container;
}

function labelDeletePanel(model, label) {
    const used = model.taskLabels.filter((taskLabel) => taskLabel.labelId === label.labelId).length;
    const from = used > 0 ? ` It is taken off the ${tasksText(used)} that have it.` : "";
    return deletePanel(
        "Delete this label?",
        `**${plain(label.name, 60)}** will be deleted for everyone.${from} This cannot be undone.`,
        encode("lbl", "delete", model.board.boardId, label.labelId),
        encode("lbl", "list", model.board.boardId),
        "Delete label",
    );
}

function priorityDeletePanel(model, level) {
    const used = model.tasks.filter((task) => task.priorityId === level.priorityId).length;
    const from = used > 0 ? ` The ${tasksText(used)} with this priority will have none.` : "";
    return deletePanel(
        "Delete this priority level?",
        `**${plain(level.name, 60)}** will be deleted for everyone.${from} This cannot be undone.`,
        encode("pri", "delete", model.board.boardId, level.priorityId),
        encode("pri", "list", model.board.boardId),
        "Delete priority",
    );
}

module.exports = { labelProgress, buildLabelList, buildPriorityList, labelDeletePanel, priorityDeletePanel };
