const { createHash } = require("node:crypto");
const logger = require("../../utils/logger");
const { bootstrapServer, markMissedChanges, serverUnchanged, takeMissedChanges } = require("../../api/syncApi");
const { buildServerPayload, mapGuildMember, mapGuildRole } = require("./syncPayloads");
const { syncChannels } = require("./syncChannels");

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
 * A short fingerprint of everything a sync sends: the same server, roles and members (in any order)
 * always give the same one, and any change to them gives another.
 */
function fingerprintOf(payload) {
    const byId = (key) => (a, b) => String(a[key]).localeCompare(String(b[key]));
    const canonical = {
        ...payload,
        roles: [...payload.roles].sort(byId("roleId")),
        members: [...payload.members]
            .map((member) => ({ ...member, roleIds: [...(member.roleIds ?? [])].map(String).sort() }))
            .sort(byId("userId")),
    };
    const stable = (value) => (Array.isArray(value)
        ? value.map(stable)
        : value && typeof value === "object"
            ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
            : value);
    return createHash("sha256").update(JSON.stringify(stable(canonical))).digest("hex");
}

/**
 * Syncs a single guild. Fetches all roles and members (with chunking); sends them only when they
 * differ from the last full sync, by fingerprint, unless `whole` asks for it or a change to the
 * server could not be sent since. Channels are synced either way.
 *
 * @param {import("discord.js").Guild} guild - A fully-fetched Guild object
 * @param {{ whole?: boolean }} [options]
 * @returns {Promise<{ roleCount: number, memberCount: number, skipped: boolean }>}
 */
async function syncGuild(guild, { whole = false } = {}) {
    // Taken before reading the server, so a change missed while it is read counts for the next sync;
    // given back if this sync fails.
    const missed = takeMissedChanges(guild.id);
    try {
        return await syncGuildNow(guild, whole || missed);
    } catch (error) {
        if (missed) markMissedChanges(guild.id);
        throw error;
    }
}

async function syncGuildNow(guild, whole) {
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
    const fingerprint = fingerprintOf(payload);

    const skipped = !whole && await serverUnchanged({ serverId: guild.id, fingerprint });
    if (!skipped) {
        await bootstrapServer({ serverId: guild.id, data: { ...payload, fingerprint } });
    }
    const channelCount = await syncChannels(guild);

    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    logger.info(
        `[SyncGuild] "${guild.name}" ${skipped ? "unchanged" : "synced"} in ${elapsed}s — ${roleEntries.length} roles, ${memberEntries.length} members, ${channelCount} channels`,
    );

    return { roleCount: roleEntries.length, memberCount: memberEntries.length, skipped };
}

module.exports = { syncGuild, fetchAllMembers, fingerprintOf };
