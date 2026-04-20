const logger = require("./logger");
const { bootstrapServer, listKnownServerIds } = require("../services/internalSyncApi");
const { buildServerPayload, mapGuildMember, mapGuildRole } = require("./syncPayloads");

/**
 * Fetches every member in a guild, paginating in chunks of 1000 to handle
 * guilds that exceed a single chunk response.
 *
 * @param {import("discord.js").Guild} guild
 * @returns {Promise<import("discord.js").Collection<string, import("discord.js").GuildMember>>}
 */
async function fetchAllMembers(guild) {
    const members = await guild.members.fetch();

    // If the returned count is less than the member count, paginate the remainder.
    while (members.size < guild.memberCount) {
        const lastId = members.last()?.id;
        if (!lastId) break;

        const chunk = await guild.members.fetch({ limit: 1000, after: lastId });
        if (chunk.size === 0) break;

        chunk.forEach((member, id) => members.set(id, member));

        logger.info(
            `[StartupSync] Fetched chunk: ${chunk.size} more members (total ${members.size})`,
        );
    }

    return members;
}

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
    logger.info(`[StartupSync] Bot is in ${guilds.length} guild(s)`);

    const results = { success: 0, failed: 0 };

    for (const partialGuild of guilds) {
        const isNew = !knownIds.has(partialGuild.id);
        const label = isNew ? "NEW" : "KNOWN";

        try {
            logger.info(
                `[StartupSync] [${label}] Syncing "${partialGuild.name}" (${partialGuild.id})`,
            );

            const guild = await partialGuild.fetch();
            const owner = await guild.fetchOwner();

            const roles = await guild.roles.fetch();
            const roleEntries = roles
                .filter((role) => !role.managed)
                .map((role) => mapGuildRole(role));

            const members = await fetchAllMembers(guild);
            const memberEntries = [...members.values()].map((member) => mapGuildMember(member));

            const payload = {
                ...buildServerPayload(guild, owner),
                roles: roleEntries,
                members: memberEntries,
            };

            await bootstrapServer({ serverId: guild.id, data: payload });

            logger.info(
                `[StartupSync] [${label}] Done "${guild.name}" — ${roleEntries.length} roles, ${memberEntries.length} members`,
            );
            results.success++;
        } catch (error) {
            logger.error(
                `[StartupSync] [${label}] Failed "${partialGuild.name}" (${partialGuild.id}): ${error.message}`,
            );
            results.failed++;
        }
    }

    logger.info(`[StartupSync] Complete — ${results.success} succeeded, ${results.failed} failed`);
}

module.exports = { runStartupSync };
