const { LabelBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, escapeMarkdown } = require("discord.js");
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

const TITLE_MAX = 100;
const DESCRIPTION_MAX = 2000;
/** One report per user per this long, per shard: enough to stop accidental or spammed repeats. */
const COOLDOWN_MS = 60_000;
const lastReportAt = new Map();

function isConfigured() {
    return devUserIds.length > 0;
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
    ].join(" "));

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

/** A report as the developers get it: what it is and its title, the text, and who sent it from where. */
function reportContainer(info, title, description, footer) {
    const container = buildContainer({ title: `${info.label}: ${title}`, accent: info.accent });
    appendText(container, description);
    appendDivider(container);
    appendFooter(container, footer);
    return container;
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
    );
    return v2Payload(container);
}

module.exports = {
    KINDS,
    isConfigured,
    buildReportModal,
    claimCooldown,
    deliverReport,
    buildLanguageRequestMessage,
    languageName,
};
