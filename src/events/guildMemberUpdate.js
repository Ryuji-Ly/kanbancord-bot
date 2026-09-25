const logger = require("../utils/logger");
const { upsertMember, syncMemberRoles } = require("../api/syncApi");
const { mapGuildMember } = require("../services/sync/syncPayloads");
const { scheduleChannelSync } = require("../services/sync/syncChannels");

/**
 * Returns true if the two members have a different role set.
 * Compares sorted role ID arrays, excluding @everyone (guild ID).
 */
function rolesChanged(oldMember, newMember) {
    const guildId = newMember.guild.id;
    const oldIds = [...oldMember.roles.cache.keys()].filter((id) => id !== guildId).sort();
    const newIds = [...newMember.roles.cache.keys()].filter((id) => id !== guildId).sort();

    if (oldIds.length !== newIds.length) return true;
    return oldIds.some((id, i) => id !== newIds[i]);
}

module.exports = {
    name: "guildMemberUpdate",
    async execute(oldMember, newMember) {
        const guild = newMember.guild;
        // The bot's own roles decide which channels it may post in.
        if (newMember.id === newMember.client.user?.id && rolesChanged(oldMember, newMember)) {
            scheduleChannelSync(guild);
        }

        try {
            const data = mapGuildMember(newMember);

            // Always sync profile fields (nickname, avatar, etc.)
            await upsertMember({ serverId: guild.id, userId: newMember.user.id, data });

            // Only sync roles if the role set actually changed
            if (rolesChanged(oldMember, newMember)) {
                await syncMemberRoles({
                    serverId: guild.id,
                    userId: newMember.user.id,
                    roleIds: data.roleIds,
                });
            }
        } catch (error) {
            logger.error(
                `[MemberUpdate] Failed for ${newMember.user.id} in ${guild.id}: ${error.message}`,
            );
        }
    },
};
