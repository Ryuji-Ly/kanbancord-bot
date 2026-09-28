const { listingTokens } = require("../../config/env");

/**
 * The bot-listing sites KanbanCord reports its numbers to. Each takes the bot's id and its totals
 * across all shards, and returns the request to make. A site is only used when its token is set.
 * To add one: its token in config/env.js, and an entry here.
 *
 * @typedef {{ botId: string, guilds: number, users: number }} Stats
 * @typedef {{ name: string, token: string, request: (stats: Stats) => { url: string, body: object } }} Site
 */

/** @type {Site[]} */
const SITES = [
    {
        // https://www.botboard.gg: its Stats API, on startup and every 30 minutes.
        name: "botboard.gg",
        token: listingTokens.botboard,
        request: ({ botId, guilds }) => ({
            url: `https://www.botboard.gg/api/v1/bots/${botId}/stats`,
            body: { server_count: guilds },
        }),
    },
    {
        // https://docs.discordbotlist.com/bot-statistics
        name: "discordbotlist.com",
        token: listingTokens.discordbotlist,
        request: ({ botId, guilds, users }) => ({
            url: `https://discordbotlist.com/api/v1/bots/${botId}/stats`,
            body: { guilds, users },
        }),
    },
];

module.exports = { SITES };
