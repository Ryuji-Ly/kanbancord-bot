const { escapeMarkdown } = require("discord.js");

/**
 * Text helpers for showing KanbanCord data in Discord. Everything a user typed (names, titles,
 * descriptions) goes through `plain` or `markdown` before it is shown.
 */

/** The API sends times in UTC without a zone; read them as UTC. */
function parseServerTime(value) {
    if (!value) {
        return null;
    }
    const text = String(value);
    const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(text) ? text : `${text}Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A Discord timestamp, shown in each reader's own time zone and language.
 * @param {Date} date
 * @param {"R"|"f"|"F"|"d"|"D"|"t"|"T"} style R is relative ("in 3 days"), f is date and time.
 */
function discordTime(date, style = "f") {
    return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

function truncate(text, max) {
    const value = String(text ?? "");
    return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** A name or title shown as it was typed, never as formatting. */
function plain(text, max = 100) {
    return escapeMarkdown(truncate(String(text ?? "").replace(/\s+/g, " ").trim(), max));
}

const MEDIA_LINK = /!\[([^\]]*)\]\((https:\/\/i\.imgur\.com\/[A-Za-z0-9]+\.(?:png|jpe?g|gif|webp|mp4|webm|mov))\)/gi;

/**
 * A task description for Discord: checklists become boxes (Discord has no task lists), and images
 * and videos uploaded to Imgur are taken out of the text, to be shown in a gallery instead.
 *
 * @returns {{ text: string, media: { url: string, description: string }[] }}
 */
function describeMarkdown(text, max) {
    const media = [];
    const body = String(text ?? "")
        .replace(MEDIA_LINK, (_match, alt, url) => {
            media.push({ url, description: alt.trim() });
            return "";
        })
        .replace(/^(\s*)[-*] \[ \] /gm, "$1- ☐ ")
        .replace(/^(\s*)[-*] \[[xX]\] /gm, "$1- ☑ ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    return { text: truncate(body, max), media };
}

/**
 * As many lines as fit in `budget` characters (joined with newlines), and how many were left out.
 * Discord allows 4000 characters of text per message, so every view shares out its budget.
 */
function fitLines(lines, budget) {
    const shown = [];
    let used = 0;
    for (const line of lines) {
        const cost = line.length + (shown.length > 0 ? 1 : 0);
        if (used + cost > budget) {
            break;
        }
        shown.push(line);
        used += cost;
    }
    return { shown, omitted: lines.length - shown.length };
}

module.exports = { parseServerTime, discordTime, truncate, plain, describeMarkdown, fitLines };
