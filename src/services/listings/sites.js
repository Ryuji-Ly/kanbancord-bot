const { listingTokens } = require("../../config/env");

/**
 * The bot-listing sites KanbanCord reports its numbers to. Each takes the bot's id and its totals
 * across all shards, and returns the request to make. A site is only used when its token is set.
 * To add one: its token in config/env.js, and an entry here.
 *
 * A site may also say how it is called: its HTTP method (POST unless it says otherwise) and how the
 * token goes in the Authorization header (as it is unless it says otherwise).
 *
 * @typedef {{ botId: string, guilds: number, users: number, shards: number }} Stats
 * @typedef {{ name: string, token: string, method?: string, authorization?: (token: string) => string,
 *   request: (stats: Stats) => { url: string, body: object } }} Site
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
    {
        // https://docs.top.gg/api/v1/projects: a v1 project token, which names the project itself.
        name: "top.gg",
        token: listingTokens.topgg,
        method: "PATCH",
        authorization: (token) => `Bearer ${token}`,
        request: ({ guilds, shards }) => ({
            url: "https://top.gg/api/v1/projects/@me/metrics",
            body: { server_count: guilds, shard_count: shards },
        }),
    },
];

module.exports = { SITES };
