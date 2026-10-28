const logger = require("./logger");

/**
 * The application's own emojis (uploaded in the Developer Portal), by name. They are loaded once the bot
 * is ready; until then, or for a name that does not exist, the fallback is used instead.
 */

let emojis = {};

/** Loads the application's emojis. Safe to call again after emojis are added or renamed. */
async function loadApplicationEmojis(client) {
    try {
        const response = await client.rest.get(`/applications/${client.user.id}/emojis`);
        emojis = Object.fromEntries((response.items ?? []).map((emoji) => [emoji.name, emoji]));
    } catch (error) {
        logger.warn(`[Emojis] Could not load the application emojis: ${error.message}`);
    }
}

/** The emoji as message markup, such as `<a:timersand:123>`, or the fallback when it is not there. */
function getEmoji(name, fallback = "") {
    const emoji = emojis[name];
    return emoji ? `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>` : fallback;
}

module.exports = { loadApplicationEmojis, getEmoji };
