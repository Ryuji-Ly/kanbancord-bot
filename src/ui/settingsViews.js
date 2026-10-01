const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const { webAppUrl } = require("../config/env");
const { encode } = require("../utils/customId");
const { plain } = require("../utils/format");
const { appendDivider, appendFooter, appendText, buildContainer } = require("./containers");
const { linkButton } = require("./boardViews");

/** The quick notification settings panels: yours (/notifications) and the server's (/kanbancord settings). */

const DM_MODE_LABELS = {
    UNLESS_PINGED: { label: "Only if I was not already mentioned", description: "Skip it when a channel I can see mentioned me" },
    ALWAYS: { label: "Always", description: "Even if a channel mentioned me too" },
    NEVER: { label: "Never", description: "No direct messages from the bot" },
};

const SERVER_MODE_LABELS = {
    DEFAULT: { label: "Everything I chose", description: "My choices on the website" },
    ASSIGNMENTS: { label: "Only when I am assigned or unassigned", description: "Nothing else from this server" },
    NONE: { label: "Nothing from this server", description: "No direct messages about this server" },
};

/** The tasks you hear about besides those you are assigned to or created. */
function alsoAbout(settings) {
    const also = [
        settings.includeFollowed !== false ? "tasks you follow" : null,
        settings.includeCommented ? "tasks you commented on" : null,
    ].filter(Boolean);
    return also.length > 0 ? `\n-# Also ${also.join(" and ")}.` : "\n-# Not tasks you follow.";
}

/** What you get by direct message, with this server's setting. */
function buildMyNotificationsPanel(settings, guildId, guildName) {
    const events = settings.catalogue
        .flatMap((category) => category.events)
        .filter((event) => event.canDm && settings.events[event.key])
        .map((event) => event.key === "USER_ASSIGNED" ? "I am assigned" : event.key === "USER_UNASSIGNED" ? "I am unassigned" : event.label);
    const serverMode = settings.servers[guildId] ?? "DEFAULT";

    const container = buildContainer({
        title: "Your notifications",
        body: "Direct messages about tasks you are assigned to, created or follow. You are never told about your own changes.",
    });
    appendDivider(container);
    appendText(container, settings.dmMode === "NEVER"
        ? "**Direct messages are off.**"
        : `**You hear about:** ${events.length > 0 ? events.join(", ") : "nothing yet"}${alsoAbout(settings)}`);

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId(encode("ntf", "mode"))
            .setPlaceholder("When to send direct messages")
            .addOptions(Object.entries(DM_MODE_LABELS).map(([value, option]) => ({
                value, ...option, label: `DMs: ${option.label}`, default: settings.dmMode === value,
            })))),
        new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId(encode("ntf", "server"))
            .setPlaceholder(`From ${guildName ?? "this server"}`)
            .setDisabled(settings.dmMode === "NEVER")
            .addOptions(Object.entries(SERVER_MODE_LABELS).map(([value, option]) => ({
                value, ...option, label: `This server: ${option.label}`.slice(0, 100), default: serverMode === value,
            })))),
        new ActionRowBuilder().addComponents(linkButton("Choose events on the website", webAppUrl)),
    );
    return appendFooter(container, "Pick which events in Settings → Notifications on the website.");
}

/** Where the bot posts about this server. */
function buildServerNotificationsPanel({ settings, boards }) {
    const channelName = (id) => {
        const channel = settings.channels.find((entry) => entry.channelId === id);
        return channel ? `#${plain(channel.name, 60)}` : "a channel that no longer exists";
    };
    const boardNames = new Map(boards.map((board) => [board.boardId, board.name]));
    const categories = new Map(settings.catalogue.map((category) => [category.key, category]));

    const container = buildContainer({ title: "Server notifications" });
    appendText(container, `**Audit log channel:** ${settings.auditChannelId ? channelName(settings.auditChannelId) : "none"}`);
    appendDivider(container);
    if (settings.feeds.length === 0) {
        appendText(container, "**Update feeds:** none yet. Add one with `/kanbancord feed`.");
    } else {
        const lines = settings.feeds.map((feed) => {
            const scope = feed.boardIds.length === 0
                ? "every board"
                : feed.boardIds.map((id) => plain(boardNames.get(id) ?? `board #${id}`, 40)).join(", ");
            const on = [...categories.values()]
                .filter((category) => category.events.some((event) => feed.events[event.key]))
                .map((category) => category.label);
            // Mentions are per event; a category is named if any of its posted events mentions people.
            const pinging = [...categories.values()]
                .filter((category) => category.events.some((event) => feed.events[event.key] && feed.mentions[event.key]))
                .map((category) => category.label);
            const buttons = feed.interactive ? " · with buttons" : "";
            return `- ${channelName(feed.channelId)} · ${scope}${buttons}\n  -# ${on.join(", ") || "nothing"}${pinging.length > 0 ? ` · mentions for ${pinging.join(", ")}` : ""}`;
        });
        appendText(container, `**Update feeds**\n${lines.join("\n")}`);
    }
    container.addActionRowComponents(new ActionRowBuilder().addComponents(linkButton("Edit on the website", webAppUrl)));
    return appendFooter(container, "Choose events and mentions per feed in Server settings → Notifications on the website.");
}

/**
 * The answer to the opt-out button on a direct message: what is now off, with a way back, and a way to
 * stop direct messages from every server.
 *
 * @param {{ serverId: string, serverName: string | null, serverMode: string, dmMode: string, undo: string[] | null }} state
 *   `undo` is the custom id arguments that put back what was just changed
 */
function buildDmOptOutPanel({ serverId, serverName, serverMode, dmMode, undo }) {
    const server = serverName ? `**${plain(serverName, 60)}**` : "this server";
    let body;
    if (dmMode === "NEVER") {
        body = "**Direct messages are off for every server.** Turn them back on with `/notifications` in any server.";
    } else if (serverMode === "NONE") {
        body = `**You won't get direct messages about ${server} any more.** Other servers still message you.`;
    } else {
        body = `**Direct messages about ${server} are back on.**`;
    }
    const container = buildContainer({ title: "Your notifications", body });
    const row = new ActionRowBuilder();
    if (undo) {
        row.addComponents(new ButtonBuilder().setCustomId(encode("dm", ...undo)).setStyle(ButtonStyle.Secondary).setLabel("Undo"));
    }
    if (dmMode !== "NEVER") {
        row.addComponents(new ButtonBuilder()
            .setCustomId(encode("dm", "all", serverId, "NEVER"))
            .setStyle(ButtonStyle.Danger)
            .setLabel("Stop all direct messages"));
    }
    row.addComponents(linkButton("Choose what you get", webAppUrl));
    container.addActionRowComponents(row);
    return appendFooter(container, "Only you see this. You can change it any time with /notifications in a server.");
}

module.exports = { buildMyNotificationsPanel, buildServerNotificationsPanel, buildDmOptOutPanel };
