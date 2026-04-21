const logger = require("../utils/logger");
const { deleteMember } = require("../services/internalSyncApi");

module.exports = {
    name: "guildMemberRemove",
    async execute(member, client) {
        const guild = member.guild;
        logger.info(`[MemberRemove] ${member.user.tag} left "${guild.name}" (${guild.id})`);

        try {
            await deleteMember({ serverId: guild.id, userId: member.user.id });
        } catch (error) {
            logger.error(
                `[MemberRemove] Failed for ${member.user.id} in ${guild.id}: ${error.message}`,
            );
        }
    },
};
