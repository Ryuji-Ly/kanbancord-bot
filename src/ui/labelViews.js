const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { colorDot } = require("../utils/colors");
const { encode } = require("../utils/customId");
const { fitLines, plain } = require("../utils/format");
const { boardUrl, linkButton } = require("./boardViews");
const { appendFooter, appendText, buildContainer, warningContainer } = require("./containers");

/** A board's labels and priority levels, and the confirmations before deleting one. */

const tasksText = (count) => `${count} task${count === 1 ? "" : "s"}`;

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

/** /label list: every label with its colour and how many tasks use it. */
function buildLabelList(model) {
    const { board } = model;
    const container = buildContainer({ title: `Labels · ${plain(board.name, 80)}` });
    switchedOff(container, model, "LABELS", "Labels");
    const lines = model.labels().map((label) => {
        const used = model.taskLabels.filter((taskLabel) => taskLabel.labelId === label.labelId).length;
        return `${colorDot(label.color)} **${plain(label.name, 60)}** · ${tasksText(used)}`;
    });
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

module.exports = { buildLabelList, buildPriorityList, labelDeletePanel, priorityDeletePanel };
