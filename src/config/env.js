const dotenv = require("dotenv");

dotenv.config();

function required(name) {
    const value = process.env[name];
    if (!value || !value.trim()) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value.trim();
}

function optional(name, fallback = "") {
    const value = process.env[name];
    if (!value || !value.trim()) {
        return fallback;
    }

    return value.trim();
}

/** A comma-separated list of Discord ids; anything that is not an id is ignored. */
function idList(name) {
    return optional(name)
        .split(",")
        .map((id) => id.trim())
        .filter((id) => /^\d{1,20}$/.test(id));
}

module.exports = {
    discordBotToken: required("DISCORD_BOT_TOKEN"),
    discordApplicationId: required("DISCORD_APPLICATION_ID"),
    discordGuildId: optional("DISCORD_GUILD_ID"),
    apiBaseUrl: optional("KANBANCORD_API_BASE_URL", "http://localhost:8080"),
    internalSyncToken: optional("KANBANCORD_INTERNAL_SYNC_TOKEN"),
    /** The website, for links in replies. */
    webAppUrl: optional("KANBANCORD_WEB_URL", "https://kanbancord.com").replace(/\/+$/, ""),
    /** An invite to the KanbanCord support server, linked from /help. */
    supportServerUrl: optional("KANBANCORD_SUPPORT_URL", "https://discord.gg/SDr4ujFPGR"),
    /** Who receives /report submissions, by DM. */
    devUserIds: idList("KANBANCORD_DEV_USER_IDS"),
};
