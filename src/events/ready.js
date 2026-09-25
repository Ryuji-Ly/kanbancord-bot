const { ActivityType } = require("discord.js");
const logger = require("../utils/logger");
const { startSyncSchedule } = require("../services/sync/syncScheduler");
const { startDeliveryWorker } = require("../delivery/deliveryWorker");

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

        // Notifications are delivered by one shard only, so each goes out once. Sending works for any
        // channel from any shard; whether someone can see a channel is asked of the shard holding it.
        if (!client.shard || client.shard.ids.includes(0)) {
            startDeliveryWorker(client);
        }
    },
};
