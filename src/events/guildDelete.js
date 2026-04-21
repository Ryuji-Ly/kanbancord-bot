const logger = require("../utils/logger");
const { markServerNotPresent } = require("../services/internalSyncApi");

module.exports = {
    name: "guildDelete",
    async execute(guild) {
        logger.info(`[GuildDelete] Bot removed from "${guild.name}" (${guild.id})`);

        try {
            await markServerNotPresent({ serverId: guild.id });
            logger.info(`[GuildDelete] Marked "${guild.name}" as bot-absent in backend`);
        } catch (error) {
            logger.error(
                `[GuildDelete] Failed to mark "${guild.name}" (${guild.id}) as bot-absent: ${error.message}`,
            );
        }
    },
};
