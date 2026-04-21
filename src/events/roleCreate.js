const logger = require("../utils/logger");
const { upsertRole } = require("../services/internalSyncApi");
const { mapGuildRole } = require("../utils/syncPayloads");

module.exports = {
    name: "roleCreate",
    async execute(role, client) {
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
