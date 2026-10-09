const logger = require("../utils/logger");
const { startSyncSchedule } = require("../services/sync/syncScheduler");
const { startDeliveryWorker } = require("../delivery/deliveryWorker");
const { startPostWorker } = require("../delivery/postWorker");
const { startListingStats } = require("../services/listings/listingStats");
const { startHeartbeat } = require("../services/status/heartbeat");
const { startPresence } = require("../services/status/presence");

module.exports = {
    name: "clientReady",
    once: true,
    async execute(client) {
        logger.info(`${client.user.tag} is online`);

        // Each shard shows its own status, so this runs on every shard.
        startPresence(client);

        // In the background: waits for the API if it is still starting, then keeps a regular re-sync.
        startSyncSchedule(client);

        // Notifications are delivered, and board posts redrawn, by one shard only, so each happens once.
        // Sending and editing work for any channel from any shard; whether someone can see a channel is
        // asked of the shard holding it.
        if (!client.shard || client.shard.ids.includes(0)) {
            startDeliveryWorker(client);
            startPostWorker(client);
            startListingStats(client);
            startHeartbeat(client);
        }
    },
};
