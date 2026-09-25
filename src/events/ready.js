const { ActivityType } = require("discord.js");
const logger = require("../utils/logger");
const { startSyncSchedule } = require("../services/sync/syncScheduler");

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

        // In the background: waits for the API if it is still starting, then keeps a regular re-sync.
        startSyncSchedule(client);
    },
};
