const logger = require("../utils/logger");
const { upsertMember, syncMemberRoles } = require("../api/syncApi");
const { mapGuildMember } = require("../services/sync/syncPayloads");

module.exports = {
    name: "guildMemberAdd",
    async execute(member) {
        const guild = member.guild;
        logger.info(`[MemberAdd] ${member.user.tag} joined "${guild.name}" (${guild.id})`);

        try {
            const data = mapGuildMember(member);
            await upsertMember({ serverId: guild.id, userId: member.user.id, data });

            if (data.roleIds.length > 0) {
                await syncMemberRoles({
                    serverId: guild.id,
                    userId: member.user.id,
                    roleIds: data.roleIds,
                });
            }
        } catch (error) {
            logger.error(
                `[MemberAdd] Failed for ${member.user.id} in ${guild.id}: ${error.message}`,
            );
        }
    },
};
