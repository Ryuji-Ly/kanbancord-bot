const { ActionRowBuilder, FileBuilder } = require("discord.js");
const { plain } = require("../utils/format");
const { boardUrl, linkButton } = require("./boardViews");
const { appendFooter, buildContainer } = require("./containers");
const { COLORS } = require("./theme");

/** What an import left out, by kind, each with what it means. */
const SKIPPED = {
    assignees: "assignees left out, as they are not in this server",
    roles: "role assignments left out, as the roles are not in this server",
    permissions: "permission rules left out, about someone not here or more than you may set",
    commentAuthors: "comments by people not in this server, now posted by you and naming who wrote them",
};

/** The exported file, attached, with what is in it. */
function buildExportView({ board, file, name, parts }) {
    const included = parts.length > 0 ? parts.map((part) => part.label).join(", ") : "nothing else";
    const container = buildContainer({
        title: `Exported ${plain(board.name, 80)}`,
        body: `${file.columns.length} columns and ${file.tasks.length} tasks, with ${included.toLowerCase()}.`,
    });
    container.addFileComponents(new FileBuilder().setURL(`attachment://${name}`));
    appendFooter(container, "Import it as a new board with /board import, here or in another server, or on the website.");
    return container;
}

/** The new board, what came along, and what was left out. */
function buildImportView({ board, imported, skipped }) {
    const counts = Object.entries(imported)
        .filter(([, count]) => count > 0)
        .map(([kind, count]) => `${count} ${kind}`)
        .join(", ");
    const left = Object.entries(SKIPPED)
        .filter(([kind]) => (skipped[kind] ?? 0) > 0)
        .map(([kind, text]) => `- ${skipped[kind]} ${text}`);
    const container = buildContainer({
        title: `Imported ${plain(board.name, 80)}`,
        body: [counts ? `Created with ${counts}.` : null, ...left].filter(Boolean).join("\n"),
        accent: COLORS.success,
    });
    container.addActionRowComponents(new ActionRowBuilder().addComponents(linkButton("Open on website", boardUrl(board))));
    appendFooter(container, `See it here with /board view board:${plain(board.name, 80)}`);
    return container;
}

module.exports = { buildExportView, buildImportView };
