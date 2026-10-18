const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { describeEntry, snapshotOf } = require("../services/notifications/describe");
const { AUDIT_TYPES } = require("../services/audit/auditTypes");
const { encode } = require("../utils/customId");
const { discordTime, fitLines, parseServerTime, plain } = require("../utils/format");
const { appendFooter, appendText, buildContainer } = require("./containers");
const { COLORS } = require("./theme");

/** Room for the entries in one message, leaving space for the heading and footer. */
const LINE_BUDGET = 3400;

const SOURCES = { DISCORD: "with a command", ACTIVITY: "in the Activity", API: "on the website" };

/** The task an entry is about, by name, when it is about one. */
function taskName(entry, names) {
    const snapshot = snapshotOf(entry);
    if (entry.entityType === "TASK") {
        const title = entry.changes?._subject ?? snapshot.title ?? names.tasks[String(entry.entityId)];
        return title ? plain(title, 80) : "a deleted task";
    }
    if (String(entry.entityType).startsWith("TASK_")) {
        const title = names.tasks[String(snapshot.taskId)];
        return title ? plain(title, 80) : "a deleted task";
    }
    return null;
}

/** Two lines: when, where and how, then what happened ("**Mia** moved it from …"). */
function entryLines(entry, names) {
    const at = parseServerTime(entry.createdAt);
    const board = entry.boardName ? plain(entry.boardName, 60) : entry.boardId ? "a deleted board" : null;
    const where = [board, taskName(entry, names)].filter(Boolean).join(" › ");
    const head = [at ? discordTime(at, "R") : null, where || null, SOURCES[entry.source]].filter(Boolean).join(" · ");
    return `-# ${head}\n${describeEntry(entry, names)}`;
}

/** What the filter shows, in words: "Sprint · Tasks · by @Mia". */
function filterText(filter, boardName) {
    return [
        filter.boardId ? plain(boardName ?? "One board", 60) : "Every board",
        filter.type ? AUDIT_TYPES[filter.type].label : null,
        filter.userId ? `by <@${filter.userId}>` : null,
    ].filter(Boolean).join(" · ");
}

/**
 * One page of the audit log, with Newest and Older buttons. The next page starts after the last
 * entry shown, so entries that did not fit in this message come first on the next.
 *
 * @param {{ filter: import("../services/audit/auditLog").AuditFilter, entries: object[], names: object,
 *   nextBefore: number | null, first: boolean, boardName?: string }} page
 */
function buildAuditPage({ filter, entries, names, nextBefore, first, boardName }) {
    const container = buildContainer({ title: "Audit log", body: `-# ${filterText(filter, boardName)}`, accent: COLORS.info });

    const { shown, omitted } = fitLines(entries.map((entry) => entryLines(entry, names)), LINE_BUDGET);
    appendText(container, shown.length > 0
        ? shown.join("\n")
        : first ? "Nothing matches these filters yet." : "No older changes.");

    const last = entries[shown.length - 1];
    const older = omitted > 0 || nextBefore ? last?.logId ?? null : null;
    appendFooter(container, "Changes made on the website, in the Activity and with commands. "
        + "Changes made in Discord itself, such as renaming a role, are not recorded.");

    const page = (action, before) =>
        encode("audit", action, filter.boardId ?? "-", filter.userId ?? "-", filter.type ?? "-", before);
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(page("newest", 0)).setStyle(ButtonStyle.Secondary).setLabel("Newest").setDisabled(first),
        new ButtonBuilder().setCustomId(page("older", older ?? 0)).setStyle(ButtonStyle.Secondary).setLabel("Older").setDisabled(!older),
    ));
    return container;
}

/** The filter kept in a page button, where "-" stands for "any". */
function filterFromArgs([boardId, userId, type]) {
    const any = (value) => (value && value !== "-" ? value : null);
    return { boardId: any(boardId), userId: any(userId), type: AUDIT_TYPES[type] ? type : null };
}

module.exports = { buildAuditPage, filterFromArgs };
