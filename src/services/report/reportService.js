const {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, escapeMarkdown,
} = require("discord.js");
const { devUserIds } = require("../../config/env");
const { buildContainer, appendDivider, appendFooter, appendText, v2Payload } = require("../../ui/containers");
const { COLORS } = require("../../ui/theme");
const { encode } = require("../../utils/customId");
const { UserFacingError } = require("../../utils/errorMessages");
const logger = require("../../utils/logger");

const KINDS = {
    issue: { label: "Issue", accent: COLORS.error },
    suggestion: { label: "Suggestion", accent: COLORS.info },
};

/** Reports that come from the website through the notification queue, not from /report. */
const LANGUAGE_REQUEST = { label: "Language request", accent: COLORS.info };

/** What a reply calls the thing it answers, by the kind in the Reply button's id. */
const REPLY_SUBJECTS = { issue: "issue report", suggestion: "suggestion", language: "language request" };
const REPLY_MAX = 2000;

const TITLE_MAX = 100;
const DESCRIPTION_MAX = 2000;
/** One report per user per this long, per shard: enough to stop accidental or spammed repeats. */
const COOLDOWN_MS = 60_000;
const lastReportAt = new Map();

function isConfigured() {
    return devUserIds.length > 0;
}

function isDeveloper(userId) {
    return devUserIds.includes(userId);
}

/** @param {keyof KINDS} kind */
function buildReportModal(kind) {
    const title = new TextInputBuilder()
        .setCustomId("title")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(TITLE_MAX)
        .setRequired(true);
    const description = new TextInputBuilder()
        .setCustomId("description")
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(DESCRIPTION_MAX)
        .setRequired(true)
        .setPlaceholder(kind === "issue"
            ? "What happened, what you expected, and how to make it happen again."
            : "What you would like, and what it would help with.");

    return new ModalBuilder()
        .setCustomId(encode("report", "submit", kind))
        .setTitle(kind === "issue" ? "Report an issue" : "Suggest something")
        .addLabelComponents(
            new LabelBuilder().setLabel("Title").setTextInputComponent(title),
            new LabelBuilder().setLabel("Description").setTextInputComponent(description),
        );
}

/** Throws when the user reported something too recently; otherwise records this report's time. */
function claimCooldown(userId, now = Date.now()) {
    const last = lastReportAt.get(userId);
    if (last !== undefined && now - last < COOLDOWN_MS) {
        const seconds = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
        throw new UserFacingError("Slow down", `You can send another report in ${seconds}s.`);
    }
    lastReportAt.set(userId, now);
}

/**
 * Sends the report to every developer by DM. Succeeds if at least one received it.
 *
 * @param {import("discord.js").Client} client
 * @param {{ kind: string, title: string, description: string, reporter: import("discord.js").User,
 *   guild: import("discord.js").Guild | null }} report
 */
async function deliverReport(client, { kind, title, description, reporter, guild }) {
    const info = KINDS[kind] ?? KINDS.issue;
    const container = reportContainer(info, title, description, [
        `From ${reporter.tag ?? reporter.username} (${reporter.id})`,
        guild ? `in ${guild.name} (${guild.id})` : "in a DM",
    ].join(" "), { userId: reporter.id, kind: KINDS[kind] ? kind : "issue" });

    const results = await Promise.allSettled(devUserIds.map(async (id) => {
        const user = await client.users.fetch(id);
        await user.send(v2Payload(container));
    }));
    const delivered = results.filter((result) => result.status === "fulfilled").length;
    results
        .filter((result) => result.status === "rejected")
        .forEach((result) => logger.warn(`[Report] Could not DM a developer: ${result.reason?.message}`));
    if (delivered === 0) {
        throw new UserFacingError("Report not sent", "The report could not be delivered. Try again later.");
    }
}

/**
 * A report as the developers get it: what it is and its title, the text, who sent it from where, and a
 * button to answer them.
 */
function reportContainer(info, title, description, footer, replyTo) {
    const container = buildContainer({ title: `${info.label}: ${title}`, accent: info.accent });
    appendText(container, description);
    appendDivider(container);
    appendFooter(container, footer);
    container.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(encode("report", "reply", replyTo.userId, replyTo.kind))
        .setLabel("Reply")
        .setStyle(ButtonStyle.Secondary)));
    return container;
}

/** The form a developer writes a reply in. */
function buildReplyModal(userId, kind) {
    const text = new TextInputBuilder()
        .setCustomId("reply")
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(REPLY_MAX)
        .setRequired(true);
    return new ModalBuilder()
        .setCustomId(encode("report", "answer", userId, kind))
        .setTitle("Reply")
        .addLabelComponents(new LabelBuilder()
            .setLabel("Your reply")
            .setDescription("Sent to them by direct message from KanbanCord.")
            .setTextInputComponent(text));
}

/**
 * The title of the report a Reply button sits on, read back from the message, so the reply can say what
 * it answers. Reports start with "### Issue: <title>".
 *
 * @param {import("discord.js").Message | null | undefined} message
 */
function reportTitleFrom(message) {
    const texts = [];
    const walk = (components) => {
        for (const component of components ?? []) {
            if (typeof component.content === "string") {
                texts.push(component.content);
            }
            walk(component.components);
        }
    };
    walk(message?.components);
    const heading = texts.map((text) => text.split("\n")[0]).find((line) => line.startsWith("### "));
    return heading ? heading.slice(4).replace(/^[^:]*: /, "") : null;
}

/**
 * Sends a developer's reply to whoever sent the report, by direct message.
 *
 * @param {import("discord.js").Client} client
 * @param {{ userId: string, kind: string, about: string | null, text: string }} reply
 * @returns {Promise<import("discord.js").User>} who it went to
 */
async function deliverReply(client, { userId, kind, about, text }) {
    const subject = REPLY_SUBJECTS[kind] ?? REPLY_SUBJECTS.issue;
    const container = buildContainer({ title: `A reply to your ${subject}`, accent: COLORS.info });
    if (about) {
        appendText(container, `> ${escapeMarkdown(about)}`);
    }
    appendText(container, text);
    appendFooter(container, "From the KanbanCord developer. To answer, use /report.");
    let user;
    try {
        user = await client.users.fetch(userId);
        await user.send(v2Payload(container));
    } catch (error) {
        logger.warn(`[Report] Could not send a reply to ${userId}: ${error.message}`);
        throw new UserFacingError("Reply not sent", user
            ? `${escapeMarkdown(user.username)} does not accept direct messages from KanbanCord, or shares no server with it any more.`
            : "That person could not be found.");
    }
    return user;
}

/** A language's English name ("Brazilian Portuguese"), or its code when it has none. */
function languageName(tag) {
    try {
        return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
    } catch {
        return tag;
    }
}

/**
 * Someone asked on the website for it in another language. Everything in it came from them, so it is
 * shown as plain text: no formatting, and (as in every message the bot sends) no mentions.
 *
 * @param {{ userId: string, userName: string | null, language: string, note: string | null }} request
 */
function buildLanguageRequestMessage(request) {
    const container = reportContainer(
        LANGUAGE_REQUEST,
        `${escapeMarkdown(languageName(request.language))} (${escapeMarkdown(request.language)})`,
        request.note ? escapeMarkdown(request.note) : "-# No note.",
        `From ${escapeMarkdown(request.userName ?? "someone")} (${request.userId}) on the website`,
        { userId: request.userId, kind: "language" },
    );
    return v2Payload(container);
}

module.exports = {
    KINDS,
    isConfigured,
    isDeveloper,
    buildReportModal,
    buildReplyModal,
    reportTitleFrom,
    deliverReply,
    claimCooldown,
    deliverReport,
    buildLanguageRequestMessage,
    languageName,
};
