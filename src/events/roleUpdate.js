const logger = require("../utils/logger");
const { scheduleChannelSync } = require("../services/sync/syncChannels");
const { upsertRole } = require("../api/syncApi");
const { mapGuildRole } = require("../services/sync/syncPayloads");

module.exports = {
    name: "roleUpdate",
    async execute(oldRole, newRole) {
        // A role change can change which channels the bot may post in.
        scheduleChannelSync(newRole.guild);
        if (newRole.managed) return;

        try {
            await upsertRole({
                serverId: newRole.guild.id,
                roleId: newRole.id,
                data: mapGuildRole(newRole),
            });
        } catch (error) {
            logger.error(
                `[RoleUpdate] Failed for role ${newRole.id} in ${newRole.guild.id}: ${error.message}`,
            );
        }
    },
};
