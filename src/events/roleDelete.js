const logger = require("../utils/logger");
const { scheduleChannelSync } = require("../services/sync/syncChannels");
const { deleteRole } = require("../api/syncApi");

module.exports = {
    name: "roleDelete",
    async execute(role) {
        // A role change can change which channels the bot may post in.
        scheduleChannelSync(role.guild);
        if (role.managed) return;

        try {
            await deleteRole({ serverId: role.guild.id, roleId: role.id });
        } catch (error) {
            logger.error(
                `[RoleDelete] Failed for role ${role.id} in ${role.guild.id}: ${error.message}`,
            );
        }
    },
};
