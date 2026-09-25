const logger = require("../utils/logger");
const { PermissionsBitField } = require("discord.js");
const { syncGuild } = require("../services/sync/syncGuild");

/**
 * Returns the best channel to post admin notices in, or null if none available.
 * Prefers the Community public updates channel (staff-only), falls back to system channel.
 */
function getNoticeChannel(guild) {
    return guild.publicUpdatesChannel ?? guild.systemChannel ?? null;
}

function canSendNotice(channel, me) {
    if (!channel || !me) return false;
    const perms = channel.permissionsFor(me);
    if (!perms) return false;

    return perms.has([
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
    ]);
}

module.exports = {
    name: "guildCreate",
    async execute(guild) {
        logger.info(`[GuildCreate] Bot joined "${guild.name}" (${guild.id}) — starting full sync`);

        try {
            const fetched = await guild.fetch();

            const noticeChannel = getNoticeChannel(fetched);
            let noticeMessage = null;

            if (canSendNotice(noticeChannel, fetched.members.me)) {
                try {
                    noticeMessage = await noticeChannel.send(
                        `**KanbanCord** has joined the server and is syncing member and role data.\n` +
                            `This may take a minute on larger servers — boards and permissions will be available once sync completes.`,
                    );
                } catch (error) {
                    logger.warn(
                        `[GuildCreate] Could not send sync notice in "${fetched.name}" (${fetched.id}): ${error.message}`,
                    );
                }
            }

            const { roleCount, memberCount } = await syncGuild(fetched);

            if (noticeMessage) {
                try {
                    await noticeMessage.edit(
                        `**KanbanCord** has finished syncing **${memberCount.toLocaleString()} members** and **${roleCount.toLocaleString()} roles**.\n` +
                            `Boards and permissions are now available. Use \`/help\` to get started.`,
                    );
                } catch (error) {
                    logger.warn(
                        `[GuildCreate] Could not edit sync notice in "${fetched.name}" (${fetched.id}): ${error.message}`,
                    );
                }
            }

            logger.info(`[GuildCreate] Sync complete for "${fetched.name}"`);
        } catch (error) {
            logger.error(
                `[GuildCreate] Sync failed for "${guild.name}" (${guild.id}): ${error.message}`,
            );
        }
    },
};
