const logger = require("../utils/logger");
const { upsertRole } = require("../api/syncApi");
const { mapGuildRole } = require("../services/sync/syncPayloads");

module.exports = {
    name: "roleCreate",
    async execute(role) {
        if (role.managed) return; // ignore bot/integration roles

        try {
            await upsertRole({
                serverId: role.guild.id,
                roleId: role.id,
                data: mapGuildRole(role),
            });
        } catch (error) {
            logger.error(
                `[RoleCreate] Failed for role ${role.id} in ${role.guild.id}: ${error.message}`,
            );
        }
    },
};
