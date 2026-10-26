const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { appendText, buildContainer } = require("./containers");
const { encode } = require("../utils/customId");
const { plain, truncate } = require("../utils/format");

/** How much of each column the preview lists; the rest is counted. */
const COLUMNS_SHOWN = 10;
const TITLES_SHOWN = 3;

const plural = (count, word, many = `${word}s`) => `${count} ${count === 1 ? word : many}`;

/** What the API's notes mean, worded for Discord. */
const NOTES = {
    TOO_MANY: (n) => `${plural(n, "task")} left out: 500 is the most at once.`,
    TITLE_SHORTENED: (n) => `${plural(n, "title")} shortened to 200 characters, with the full text in the description.`,
    COLUMNS_NOT_CREATED: (n) => `${plural(n, "task")} put in the chosen column, as you may not create their column.`,
    TOO_MANY_COLUMNS: (n) => `${plural(n, "task")} put in the chosen column, as an import creates at most 20 columns.`,
    DUE_DATES_OFF: (n) => `${plural(n, "due date")} left out: due dates are off on this board.`,
    DUE_UNREADABLE: (n) => `${plural(n, "due date")} could not be read (write them like 2026-10-20 or 2026-10-20 18:00).`,
    PRIORITIES_OFF: (n) => `${plural(n, "priority", "priorities")} left out: priorities are off on this board.`,
    PRIORITY_UNKNOWN: (n) => `${plural(n, "priority", "priorities")} this board does not have, left out.`,
    LABELS_OFF: (n) => `${plural(n, "label")} left out: labels are off on this board.`,
    LABEL_UNKNOWN: (n) => `${plural(n, "label")} this board does not have, left out.`,
    LABELS_NOT_ALLOWED: (n) => `${plural(n, "label")} left out: you may not add labels to tasks.`,
};

const FORMATS = {
    LIST: "a list",
    CSV: "a CSV table",
    TSV: "spreadsheet cells",
    MARKDOWN: "a Markdown table",
    KANBANCORD: "a KanbanCord board file",
};

/** The preview, privately: where each task goes and what is left out, with Import and Cancel. */
function importPreview(board, plan, pendingId) {
    const tasks = plan.tasks ?? [];
    const columns = plan.columns ?? [];
    const container = buildContainer({
        title: `Import into ${plain(board.name, 80)}`,
        body: tasks.length > 0
            ? `${plural(tasks.length, "task")} in ${plural(columns.length, "column")}, read as ${FORMATS[plan.format] ?? "text"}.`
            : "There are no tasks in it to import.",
    });
    const lines = columns.slice(0, COLUMNS_SHOWN).map((column) => {
        const titles = tasks.filter((task) => task.column === column.name).slice(0, TITLES_SHOWN)
            .map((task) => `- ${plain(truncate(task.title, 80), 80)}`);
        const more = column.tasks > TITLES_SHOWN ? [`-# and ${column.tasks - TITLES_SHOWN} more`] : [];
        return [`**${plain(column.name, 60)}**${column.created ? " *(new column)*" : ""} · ${plural(column.tasks, "task")}`, ...titles, ...more]
            .join("\n");
    });
    if (columns.length > COLUMNS_SHOWN) {
        lines.push(`-# and ${plural(columns.length - COLUMNS_SHOWN, "more column")}`);
    }
    if (lines.length > 0) {
        appendText(container, lines.join("\n\n"));
    }
    const notes = (plan.notes ?? []).map((note) => {
        const text = NOTES[note.code]?.(note.count) ?? `${note.code}: ${note.count}`;
        const examples = note.examples?.length ? ` (${note.examples.map((example) => plain(truncate(example, 40), 40)).join(", ")})` : "";
        return `- ${text}${examples}`;
    });
    if (notes.length > 0) {
        appendText(container, notes.join("\n"));
    }
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(encode("imp", "go", pendingId))
            .setStyle(ButtonStyle.Success)
            .setLabel(tasks.length > 0 ? `Import ${plural(tasks.length, "task")}` : "Import")
            .setDisabled(tasks.length === 0),
        new ButtonBuilder()
            .setCustomId(encode("imp", "no", pendingId))
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Cancel"),
    ));
    return container;
}

module.exports = { importPreview, plural };
