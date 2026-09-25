const { ActionRowBuilder } = require("discord.js");
const { webAppUrl } = require("../config/env");
const { describeEntry } = require("../services/notifications/describe");
const { discordTime, fitLines, parseServerTime, plain } = require("../utils/format");
const { appendFooter, appendText, buildContainer, v2Payload } = require("./containers");
const { linkButton } = require("./boardViews");
const { COLORS } = require("./theme");

/**
 * Messages the bot posts on its own: in update feeds, in the audit log channel, and by direct
 * message. Each is one container for one plan: a task (or board) and what happened to it.
 */

/** Discord's limit on the text of one message, with room for the heading and footer. */
const LINE_BUDGET = 3400;

function entriesById(plan, ids) {
    const wanted = new Set(ids.map(Number));
    return plan.entries.filter((entry) => wanted.has(Number(entry.logId)));
}

/** "Fix login" on "Sprint", or just the board for changes that are not about a task. */
function heading(plan) {
    const board = plan.board ? plain(plan.board.name, 60) : null;
    if (plan.task) {
        const title = plain(plan.task.title ?? `Task #${plan.task.taskId}`, 150);
        return { title: plan.task.deleted ? `~~${title}~~` : title, subtitle: board };
    }
    return { title: board ?? "Server settings", subtitle: null };
}

function taskUrl(plan) {
    if (!plan.board) {
        return webAppUrl;
    }
    const task = plan.task && !plan.task.deleted ? `&task=${plan.task.taskId}` : "";
    return `${webAppUrl}/boards/${plan.board.boardId}?serverId=${plan.serverId}${task}`;
}

function linesFor(plan, entries) {
    const lines = entries.map((entry) => describeEntry(entry, plan.names));
    const { shown, omitted } = fitLines(lines, LINE_BUDGET);
    if (omitted > 0) {
        shown.push(`-# and ${omitted} more change${omitted === 1 ? "" : "s"}; see the audit log on the website`);
    }
    return shown.join("\n");
}

function whenOf(entries) {
    const last = parseServerTime(entries.at(-1)?.createdAt);
    return last ? discordTime(last, "R") : null;
}

/**
 * A feed post. Only the people and roles in the delivery are pinged; other mentions in the text
 * (someone who was unassigned, say) show as names without a ping.
 */
function buildFeedMessage(plan, delivery) {
    const entries = entriesById(plan, delivery.entryIds);
    const { title, subtitle } = heading(plan);
    const container = buildContainer({ title, body: subtitle ? `-# ${subtitle}` : undefined });
    appendText(container, linesFor(plan, entries));

    // People to ping who are not named in the lines yet, such as a task's assignees on a new comment.
    const text = entries.map((entry) => describeEntry(entry, plan.names)).join("\n");
    const extra = [
        ...delivery.mentionUserIds.filter((id) => !text.includes(`<@${id}>`)).map((id) => `<@${id}>`),
        ...delivery.mentionRoleIds.filter((id) => !text.includes(`<@&${id}>`)).map((id) => `<@&${id}>`),
    ];
    if (extra.length > 0) {
        appendText(container, extra.join(" "));
    }
    const when = whenOf(entries);
    if (when) {
        appendFooter(container, when);
    }
    if (plan.board) {
        container.addActionRowComponents(new ActionRowBuilder().addComponents(
            linkButton(plan.task && !plan.task.deleted ? "Open task" : "Open board", taskUrl(plan))));
    }

    const payload = v2Payload(container);
    payload.allowedMentions = { users: delivery.mentionUserIds, roles: delivery.mentionRoleIds };
    return payload;
}

/** An audit channel post: every change, compactly, never pinging anyone. */
function buildAuditMessage(plan, delivery) {
    const entries = entriesById(plan, delivery.entryIds);
    const { title, subtitle } = heading(plan);
    const container = buildContainer({ accent: COLORS.info });
    const where = subtitle ? `${subtitle} › ${title}` : title;
    const lines = entries.map((entry) => {
        const at = parseServerTime(entry.createdAt);
        const via = entry.source === "DISCORD" ? " *(via Discord)*" : "";
        return `${at ? `${discordTime(at, "t")} ` : ""}${describeEntry(entry, plan.names)}${via}`;
    });
    const { shown, omitted } = fitLines(lines, LINE_BUDGET);
    appendText(container, `**${where}**\n${shown.join("\n")}${omitted > 0 ? `\n-# and ${omitted} more` : ""}`);
    return v2Payload(container);
}

/** A direct message about the changes that concern this person. */
function buildDirectMessage(plan, message, serverName) {
    const entries = entriesById(plan, message.entryIds);
    const { title, subtitle } = heading(plan);
    const place = [subtitle, serverName ? `in ${plain(serverName, 60)}` : null].filter(Boolean).join(" ");
    const container = buildContainer({ title, body: place ? `-# ${place}` : undefined });
    // Written to the person: "assigned you" rather than their own mention.
    appendText(container, linesFor(plan, entries).split(`<@${message.userId}>`).join("you"));
    appendFooter(container, `You get these about tasks you are assigned to or created. Change what you get in Settings → Notifications on ${webAppUrl.replace(/^https?:\/\//, "")}.`);
    if (plan.board) {
        container.addActionRowComponents(new ActionRowBuilder().addComponents(
            linkButton(plan.task && !plan.task.deleted ? "Open task" : "Open board", taskUrl(plan))));
    }
    // A direct message never needs to ping: it notifies by itself.
    return v2Payload(container);
}

module.exports = { buildFeedMessage, buildAuditMessage, buildDirectMessage };
