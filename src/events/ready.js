const { ActivityType } = require("discord.js");
const logger = require("../utils/logger");
const { runStartupSync } = require("../utils/startupSync");

module.exports = {
    name: "clientReady",
    once: true,
    async execute(client) {
        logger.info(`${client.user.tag} is online`);

        await client.user.setPresence({
            status: "online",
            activities: [
                {
                    type: ActivityType.Watching,
                    name: "KanbanCord boards",
                },
            ],
        });

        // Run in background — don't block the ready handler
        runStartupSync(client).catch((error) => {
            logger.error(`[StartupSync] Unhandled error: ${error.message}`);
        });
    },
};
