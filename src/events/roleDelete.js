const logger = require("../utils/logger");
const { deleteRole } = require("../services/internalSyncApi");

module.exports = {
    name: "roleDelete",
    async execute(role, client) {
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
