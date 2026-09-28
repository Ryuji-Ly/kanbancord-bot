const logger = require("../../utils/logger");
const { SITES } = require("./sites");

/**
 * Keeps the bot-listing sites' server counts current: once shortly after startup, then every 30
 * minutes. Runs on one shard only, with totals gathered from every shard, so each site gets one
 * number rather than conflicting ones.
 */

const FIRST_POST_MS = 60_000;
const INTERVAL_MS = 30 * 60_000;
const TIMEOUT_MS = 10_000;

/** Servers and their members, across every shard. */
async function totals(client) {
    if (!client.shard) {
        return {
            guilds: client.guilds.cache.size,
            users: client.guilds.cache.reduce((sum, guild) => sum + (guild.memberCount ?? 0), 0),
        };
    }
    const [guilds, users] = await Promise.all([
        client.shard.fetchClientValues("guilds.cache.size"),
        client.shard.broadcastEval((shard) => shard.guilds.cache.reduce((sum, guild) => sum + (guild.memberCount ?? 0), 0)),
    ]);
    const sum = (values) => values.reduce((total, value) => total + Number(value || 0), 0);
    return { guilds: sum(guilds), users: sum(users) };
}

/**
 * Sends the stats to every site with a token. One site failing does not stop the others.
 * @returns {Promise<{ name: string, ok: boolean }[]>}
 */
async function postStats(stats, { sites = SITES, send = fetch } = {}) {
    const results = [];
    for (const site of sites.filter((entry) => entry.token)) {
        const { url, body } = site.request(stats);
        try {
            const response = await send(url, {
                method: "POST",
                headers: { Authorization: site.token, "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(TIMEOUT_MS),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            results.push({ name: site.name, ok: true });
        } catch (error) {
            logger.warn(`[Listings] Could not update ${site.name}: ${error.message}`);
            results.push({ name: site.name, ok: false });
        }
    }
    return results;
}

/** Starts reporting, if any site has a token. Call once, on the shard that runs the background work. */
function startListingStats(client) {
    if (!SITES.some((site) => site.token)) {
        return () => {};
    }
    const run = async () => {
        try {
            const stats = { botId: client.user.id, ...(await totals(client)) };
            const results = await postStats(stats);
            const reached = results.filter((result) => result.ok).map((result) => result.name);
            if (reached.length > 0) {
                logger.info(`[Listings] ${stats.guilds} servers sent to ${reached.join(", ")}`);
            }
        } catch (error) {
            // Most likely shards still starting; the next round will do.
            logger.warn(`[Listings] Could not gather stats: ${error.message}`);
        }
    };
    // After every shard is up, so the first count is complete.
    const first = setTimeout(run, FIRST_POST_MS);
    const every = setInterval(run, INTERVAL_MS);
    return () => {
        clearTimeout(first);
        clearInterval(every);
    };
}

module.exports = { postStats, startListingStats, totals };
