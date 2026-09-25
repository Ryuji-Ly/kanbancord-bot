const { discordTime, parseServerTime, plain, truncate } = require("../../utils/format");

/**
 * What an audit entry says, as a line for Discord: "**Mia** moved it from **Todo** to **Doing**".
 * Entries in a plan are about the task or board named in the message's heading, so they say "it"
 * rather than repeating the name. People and roles are shown as mentions (whether a mention pings
 * is decided separately, by the message's allowed mentions), times as Discord timestamps.
 */

function record(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function snapshotOf(entry) {
    return record(entry.changes?.created) ?? record(entry.changes?.deleted) ?? {};
}

function actorOf(entry) {
    return `**${plain(entry.actorDisplayName || entry.actorUsername || "Someone", 60)}**`;
}

function bold(text, max = 60) {
    return `**${plain(text, max)}**`;
}

/** A name from the plan's lookups, or a fallback for things deleted since. */
function nameOf(names, kind, id, fallback) {
    const name = id === null || id === undefined ? null : names?.[kind]?.[String(id)];
    return name ? bold(name) : fallback;
}

function dueText(value) {
    const date = parseServerTime(value);
    return date ? `${discordTime(date, "f")} (${discordTime(date, "R")})` : null;
}

/** What a task edit changed, in words. */
function taskEdits(entry, names) {
    const changes = entry.changes ?? {};
    const parts = [];
    if (record(changes.title)) {
        parts.push(`renamed it to ${bold(changes.title.to ?? "", 100)}`);
    }
    if (typeof changes._fromColumn === "string" && typeof changes._column === "string") {
        parts.push(`moved it from ${bold(changes._fromColumn)} to ${bold(changes._column)}`);
    }
    if (record(changes.description)) {
        parts.push(changes.description.to ? "edited the description" : "removed the description");
    }
    if (record(changes.dueDate)) {
        const due = dueText(changes.dueDate.to);
        parts.push(due ? `set it due ${due}` : "removed the due date");
    }
    if (record(changes.priorityId)) {
        const to = changes.priorityId.to;
        parts.push(to === null || to === undefined
            ? "removed the priority"
            : `set the priority to ${nameOf(names, "priorities", to, "another level")}`);
    }
    return parts.length > 0 ? parts.join(", ") : "edited it";
}

const VERBS = { CREATED: "created", UPDATED: "edited", DELETED: "deleted", MOVED: "moved", ARCHIVED: "archived", RESTORED: "restored" };
const NOUNS = { BOARD: "the board", BOARD_COLUMN: "column", LABEL: "label", PRIORITY: "priority level", SETTINGS: "settings" };

/**
 * @param {object} entry an audit entry, as the API sends it
 * @param {{ columns?: object, labels?: object, priorities?: object }} names
 * @returns {string} the whole line, starting with who did it
 */
function describeEntry(entry, names = {}) {
    const snapshot = snapshotOf(entry);
    const changes = entry.changes ?? {};
    const actor = actorOf(entry);

    switch (entry.action) {
        // Reminders: nobody did anything, time passed.
        case "TASK_DUE_SOON":
            return `⏰ Due ${dueText(changes.dueDate) ?? "soon"}`;
        case "TASK_OVERDUE":
            return `⚠️ Overdue: it was due ${dueText(changes.dueDate) ?? "earlier"}`;
        case "TASK_CREATED":
            return `${actor} created it in ${nameOf(names, "columns", snapshot.columnId, "a column")}`;
        case "TASK_DELETED":
            return `${actor} deleted it`;
        case "TASK_MOVED":
            return typeof changes._fromColumn === "string"
                ? `${actor} moved it from ${bold(changes._fromColumn)} to ${bold(changes._column ?? "")}`
                : `${actor} reordered it`;
        case "TASK_UPDATED":
            return `${actor} ${taskEdits(entry, names)}`;
        case "TASK_ASSIGNMENT_CREATED":
            return `${actor} assigned <@${snapshot.userId}>`;
        case "TASK_ASSIGNMENT_DELETED":
            return `${actor} unassigned <@${snapshot.userId}>`;
        case "TASK_ROLE_ASSIGNED":
            return `${actor} assigned the role <@&${snapshot.roleId}>`;
        case "TASK_ROLE_UNASSIGNED":
            return `${actor} unassigned the role <@&${snapshot.roleId}>`;
        case "TASK_COMMENT_CREATED": {
            const content = String(snapshot.content ?? "").trim();
            const quoted = truncate(content, 400).split("\n").map((line) => `> ${line}`).join("\n");
            return content ? `${actor} commented:\n${quoted}` : `${actor} commented`;
        }
        case "TASK_COMMENT_UPDATED":
            return `${actor} edited a comment`;
        case "TASK_COMMENT_DELETED":
            return `${actor} deleted a comment`;
        case "TASK_LABEL_ADDED":
            return `${actor} added the label ${nameOf(names, "labels", snapshot.labelId, "a label")}`;
        case "TASK_LABEL_REMOVED":
            return `${actor} removed the label ${nameOf(names, "labels", snapshot.labelId, "a label")}`;
        case "COLUMN_UPDATED":
            return record(changes.name)
                ? `${actor} renamed column ${bold(changes.name.from ?? "")} to ${bold(changes.name.to ?? "")}`
                : `${actor} edited column ${bold(changes._subject ?? "")}`;
        case "BOARD_UPDATED":
            return record(changes.name)
                ? `${actor} renamed the board from ${bold(changes.name.from ?? "")} to ${bold(changes.name.to ?? "")}`
                : `${actor} edited the board's details`;
        case "PERMISSION_CREATED":
        case "PERMISSION_UPDATED":
        case "PERMISSION_DELETED":
            return `${actor} changed a permission rule`;
        case "SERVER_FEATURES_UPDATED":
            return `${actor} changed which features the server uses`;
        case "BOARD_FEATURES_UPDATED":
            return `${actor} changed which features the board uses`;
        case "NOTIFICATIONS_UPDATED":
            return `${actor} changed the Discord notification settings`;
    }

    const verb = VERBS[entry.action.slice(entry.action.lastIndexOf("_") + 1)] ?? "changed";
    const noun = NOUNS[entry.entityType] ?? String(entry.entityType ?? "").toLowerCase().replace(/_/g, " ");
    const name = snapshot.title ?? snapshot.name ?? changes._subject;
    return `${actor} ${verb} ${noun}${name && entry.entityType !== "BOARD" ? ` ${bold(name)}` : ""}`;
}

module.exports = { describeEntry, snapshotOf };
