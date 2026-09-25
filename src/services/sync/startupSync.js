const logger = require("../../utils/logger");
const { listKnownServerIds, markServerNotPresent } = require("../../api/syncApi");
const { syncGuild } = require("./syncGuild");

/**
 * Runs a full bootstrap sync for every guild the bot is in.
 * New guilds (not yet in the backend) are logged separately from known ones.
 * Member fetching is complete — no limit cap, with explicit chunking for large guilds.
 *
 * @param {import("discord.js").Client} client
 */
async function runStartupSync(client) {
    logger.info("[StartupSync] Starting startup sync for all guilds...");

    let knownIds;
    try {
        knownIds = await listKnownServerIds();
        logger.info(`[StartupSync] Backend reports ${knownIds.size} known server(s)`);
    } catch (error) {
        logger.error(
            `[StartupSync] Could not fetch known server IDs from backend: ${error.message}`,
        );
        logger.warn("[StartupSync] Proceeding with full bootstrap for all guilds");
        knownIds = new Set();
    }

    const guilds = [...client.guilds.cache.values()];
    const currentGuildIds = new Set(guilds.map((guild) => guild.id));
    logger.info(`[StartupSync] Bot is in ${guilds.length} guild(s)`);

    // Each shard only sees its own servers, so with several shards "not in this shard" does not mean
    // the bot left; only a single shard can tell which servers the bot is no longer in.
    const shardCount = client.shard?.count ?? 1;
    const staleServerIds = shardCount === 1
        ? [...knownIds].filter((serverId) => !currentGuildIds.has(serverId))
        : [];
    for (const serverId of staleServerIds) {
        try {
            await markServerNotPresent({ serverId });
            logger.info(`[StartupSync] [STALE] Marked server ${serverId} as bot-absent`);
        } catch (error) {
            logger.error(
                `[StartupSync] [STALE] Failed to mark server ${serverId} as bot-absent: ${error.message}`,
            );
        }
    }

    const results = { success: 0, failed: 0 };

    for (const partialGuild of guilds) {
        const isNew = !knownIds.has(partialGuild.id);
        const label = isNew ? "NEW" : "KNOWN";

        try {
            logger.info(
                `[StartupSync] [${label}] Syncing "${partialGuild.name}" (${partialGuild.id})`,
            );

            const guild = await partialGuild.fetch();
            const { roleCount, memberCount } = await syncGuild(guild);

            logger.info(
                `[StartupSync] [${label}] Done "${guild.name}" — ${roleCount} roles, ${memberCount} members`,
            );
            results.success++;
        } catch (error) {
            logger.error(
                `[StartupSync] [${label}] Failed "${partialGuild.name}" (${partialGuild.id}): ${error.stack}`,
            );
            results.failed++;
        }
    }

    logger.info(`[StartupSync] Complete — ${results.success} succeeded, ${results.failed} failed`);
    return results;
}

module.exports = { runStartupSync };
