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

module.exports = {
    discordBotToken: required("DISCORD_BOT_TOKEN"),
    discordApplicationId: required("DISCORD_APPLICATION_ID"),
    discordGuildId: optional("DISCORD_GUILD_ID"),
    apiBaseUrl: optional("KANBANCORD_API_BASE_URL", "http://localhost:8080"),
    internalSyncToken: optional("KANBANCORD_INTERNAL_SYNC_TOKEN"),
};
