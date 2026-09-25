const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
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

/** What you get by direct message, with this server's setting. */
function buildMyNotificationsPanel(settings, guildId, guildName) {
    const events = settings.catalogue
        .flatMap((category) => category.events)
        .filter((event) => event.canDm && settings.events[event.key])
        .map((event) => event.key === "USER_ASSIGNED" ? "I am assigned" : event.key === "USER_UNASSIGNED" ? "I am unassigned" : event.label);
    const serverMode = settings.servers[guildId] ?? "DEFAULT";

    const container = buildContainer({
        title: "Your notifications",
        body: "Direct messages about tasks you are assigned to or created. You are never told about your own changes.",
    });
    appendDivider(container);
    appendText(container, settings.dmMode === "NEVER"
        ? "**Direct messages are off.**"
        : `**You hear about:** ${events.length > 0 ? events.join(", ") : "nothing yet"}${settings.includeCommented ? "\n-# Also tasks you commented on." : ""}`);

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
            const pinging = [...categories.values()].filter((category) => feed.mentions[category.key]).map((category) => category.label);
            return `- ${channelName(feed.channelId)} · ${scope}\n  -# ${on.join(", ") || "nothing"}${pinging.length > 0 ? ` · mentions for ${pinging.join(", ")}` : ""}`;
        });
        appendText(container, `**Update feeds**\n${lines.join("\n")}`);
    }
    container.addActionRowComponents(new ActionRowBuilder().addComponents(linkButton("Edit on the website", webAppUrl)));
    return appendFooter(container, "Choose events and mentions per feed in Server settings → Notifications on the website.");
}

module.exports = { buildMyNotificationsPanel, buildServerNotificationsPanel };
