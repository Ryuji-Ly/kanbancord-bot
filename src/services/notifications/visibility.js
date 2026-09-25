const { PermissionFlagsBits } = require("discord.js");

/**
 * Whether someone can see a channel, and so whether a mention there actually reached them. Asked
 * of whichever shard holds the server; with one shard that is always this one.
 */

/** Runs on the shard holding the guild. Returns null when this shard does not have it. */
async function checkLocally(client, { guildId, channelId, userId }) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
        return null;
    }
    const channel = guild.channels.cache.get(channelId);
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!channel || !member) {
        return { canSee: false, roleIds: [] };
    }
    return {
        canSee: Boolean(channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)),
        roleIds: [...member.roles.cache.keys()],
    };
}

/**
 * @returns {Promise<{ canSee: boolean, roleIds: string[] }>} whether the user can view the channel,
 *   and their roles (a role mention reaches them too)
 */
async function channelVisibility(client, guildId, channelId, userId) {
    const local = await checkLocally(client, { guildId, channelId, userId });
    if (local || !client.shard) {
        return local ?? { canSee: false, roleIds: [] };
    }
    const answers = await client.shard.broadcastEval(
        async (shardClient, context) => {
            const { PermissionFlagsBits: flags } = require("discord.js");
            const guild = shardClient.guilds.cache.get(context.guildId);
            if (!guild) {
                return null;
            }
            const channel = guild.channels.cache.get(context.channelId);
            const member = await guild.members.fetch(context.userId).catch(() => null);
            if (!channel || !member) {
                return { canSee: false, roleIds: [] };
            }
            return {
                canSee: Boolean(channel.permissionsFor(member)?.has(flags.ViewChannel)),
                roleIds: [...member.roles.cache.keys()],
            };
        },
        { context: { guildId, channelId, userId } },
    );
    return answers.find(Boolean) ?? { canSee: false, roleIds: [] };
}

/** The server's name, for direct messages, from whichever shard has it. */
async function serverName(client, guildId) {
    const local = client.guilds.cache.get(guildId)?.name;
    if (local || !client.shard) {
        return local ?? null;
    }
    const names = await client.shard.broadcastEval(
        (shardClient, context) => shardClient.guilds.cache.get(context.guildId)?.name ?? null,
        { context: { guildId } },
    );
    return names.find(Boolean) ?? null;
}

module.exports = { channelVisibility, serverName };
