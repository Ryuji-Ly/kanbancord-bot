const logger = require("../utils/logger");
const { syncGuild } = require("../utils/syncGuild");

/**
 * Returns the best channel to post admin notices in, or null if none available.
 * Prefers the Community public updates channel (staff-only), falls back to system channel.
 */
function getNoticeChannel(guild) {
    return guild.publicUpdatesChannel ?? guild.systemChannel ?? null;
}

module.exports = {
    name: "guildCreate",
    async execute(guild, client) {
        logger.info(`[GuildCreate] Bot joined "${guild.name}" (${guild.id}) — starting full sync`);

        try {
            const fetched = await guild.fetch();

            const noticeChannel = getNoticeChannel(fetched);
            let noticeMessage = null;

            if (noticeChannel?.permissionsFor(fetched.members.me)?.has("SendMessages")) {
                noticeMessage = await noticeChannel.send(
                    `**KanbanCord** has joined the server and is syncing member and role data.\n` +
                        `This may take a minute on larger servers — boards and permissions will be available once sync completes.`,
                );
            }

            const { roleCount, memberCount } = await syncGuild(fetched);

            if (noticeMessage) {
                await noticeMessage.edit(
                    `**KanbanCord** has finished syncing **${memberCount.toLocaleString()} members** and **${roleCount.toLocaleString()} roles**.\n` +
                        `Boards and permissions are now available. Use \`/help\` to get started.`,
                );
            }

            logger.info(`[GuildCreate] Sync complete for "${fetched.name}"`);
        } catch (error) {
            logger.error(
                `[GuildCreate] Sync failed for "${guild.name}" (${guild.id}): ${error.message}`,
            );
        }
    },
};
