const logger = require("../utils/logger");
const { upsertRole } = require("../services/internalSyncApi");
const { mapGuildRole } = require("../utils/syncPayloads");

module.exports = {
    name: "roleUpdate",
    async execute(oldRole, newRole, client) {
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
