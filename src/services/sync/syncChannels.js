const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { replaceChannels } = require("../../api/syncApi");
const logger = require("../../utils/logger");

/**
 * Tells KanbanCord which text channels a server has, and whether the bot may post in each, so the
 * website can offer them by name for notifications. Sent as the complete list; a burst of channel
 * or permission changes is sent once, after it settles.
 */

const POSTABLE = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const SETTLE_MS = 3_000;
const pending = new Map();

/** @param {import("discord.js").Guild} guild */
function channelList(guild) {
    const me = guild.members.me;
    return [...guild.channels.cache.values()]
        .filter((channel) => POSTABLE.includes(channel.type))
        .map((channel) => ({
            channel,
            // Channels are listed as Discord shows them: by category, then by position within it.
            order: (channel.parent?.rawPosition ?? -1) * 10_000 + channel.rawPosition,
        }))
        .sort((a, b) => a.order - b.order)
        .map(({ channel }, index) => ({
            channelId: channel.id,
            name: channel.name,
            category: channel.parent?.name ?? null,
            position: index,
            botCanPost: Boolean(me && channel.permissionsFor(me)?.has([
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
            ])),
        }));
}

/** Sends the server's channels now. */
async function syncChannels(guild) {
    const channels = channelList(guild);
    await replaceChannels({ serverId: guild.id, channels });
    return channels.length;
}

/** Sends the server's channels once changes have settled; for events that come in bursts. */
function scheduleChannelSync(guild) {
    clearTimeout(pending.get(guild.id));
    pending.set(guild.id, setTimeout(() => {
        pending.delete(guild.id);
        syncChannels(guild).catch((error) =>
            logger.error(`[ChannelSync] Failed for ${guild.id}: ${error.message}`));
    }, SETTLE_MS));
}

module.exports = { channelList, syncChannels, scheduleChannelSync };
