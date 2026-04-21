const logger = require("./logger");
const { bootstrapServer } = require("../services/internalSyncApi");
const { buildServerPayload, mapGuildMember, mapGuildRole } = require("./syncPayloads");

/**
 * Fetches every member in a guild, paginating in chunks of 1000.
 * Handles guilds that exceed a single chunk response.
 *
 * @param {import("discord.js").Guild} guild - A fully-fetched Guild object
 * @returns {Promise<import("discord.js").Collection<string, import("discord.js").GuildMember>>}
 */
async function fetchAllMembers(guild) {
    const members = await guild.members.fetch();

    while (members.size < guild.memberCount) {
        const lastId = members.last()?.id;
        if (!lastId) break;

        const chunk = await guild.members.fetch({ limit: 1000, after: lastId });
        if (chunk.size === 0) break;

        chunk.forEach((member, id) => members.set(id, member));

        logger.info(
            `[SyncGuild] Fetched chunk: ${chunk.size} more members for "${guild.name}" (total ${members.size})`,
        );
    }

    return members;
}

/**
 * Performs a full bootstrap sync for a single guild.
 * Fetches all roles and members (with chunking), then posts to the backend.
 *
 * @param {import("discord.js").Guild} guild - A fully-fetched Guild object
 */
async function syncGuild(guild) {
    const start = Date.now();

    const owner = await guild.fetchOwner();

    const roles = await guild.roles.fetch();
    const roleEntries = roles.filter((role) => !role.managed).map((role) => mapGuildRole(role));

    const members = await fetchAllMembers(guild);
    const memberEntries = [...members.values()].map((member) => mapGuildMember(member));

    const payload = {
        ...buildServerPayload(guild, owner),
        roles: roleEntries,
        members: memberEntries,
    };

    await bootstrapServer({ serverId: guild.id, data: payload });

    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    logger.info(
        `[SyncGuild] "${guild.name}" synced in ${elapsed}s — ${roleEntries.length} roles, ${memberEntries.length} members`,
    );

    return { roleCount: roleEntries.length, memberCount: memberEntries.length };
}

module.exports = { syncGuild, fetchAllMembers };
