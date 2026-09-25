const logger = require("../utils/logger");
const { upsertServer } = require("../api/syncApi");
const { buildServerPayload } = require("../services/sync/syncPayloads");

module.exports = {
    name: "guildUpdate",
    async execute(oldGuild, newGuild) {
        // The owner has every permission in KanbanCord, so an ownership transfer must reach the API.
        const changed =
            oldGuild.ownerId !== newGuild.ownerId ||
            oldGuild.name !== newGuild.name ||
            oldGuild.icon !== newGuild.icon;
        if (!changed) return;

        try {
            const owner = await newGuild.fetchOwner();
            await upsertServer({ serverId: newGuild.id, data: buildServerPayload(newGuild, owner) });
        } catch (error) {
            logger.error(`[GuildUpdate] Failed for ${newGuild.id}: ${error.message}`);
        }
    },
};
