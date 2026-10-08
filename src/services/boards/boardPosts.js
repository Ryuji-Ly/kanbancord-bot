const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { buildBoardPost } = require("../../ui/postViews");
const { v2Payload } = require("../../ui/containers");
const { UserFacingError } = require("../../utils/errorMessages");
const logger = require("../../utils/logger");
const { getSnapshot, snapshotModel } = require("./boardData");
const { listOf, missingFrom, missingIn, postingNeeds } = require("../permissions/botAccess");

/**
 * Posting a board in the channel or thread a command ran in. The post shows the whole board to
 * everyone who can see it there, so before posting, the people who can see the channel are checked
 * against who may see the board; if some may not, the user is asked first.
 */

/** The API refuses to check more people than this at once. */
const AUDIENCE_MAX = 25_000;

/**
 * Everyone (but bots) who can read messages where the post would go: for a private thread, its
 * members; for a public thread, whoever can see its channel; otherwise whoever can see the channel.
 *
 * @param {import("discord.js").GuildTextBasedChannel} channel
 * @returns {Promise<string[]>}
 */
async function channelAudience(channel) {
    const guild = channel.guild;
    if (channel.type === ChannelType.PrivateThread) {
        const members = await channel.members.fetch();
        return [...members.keys()].filter((id) => !guild.members.cache.get(id)?.user.bot && id !== guild.client.user.id);
    }
    const visibleIn = channel.isThread() ? channel.parent : channel;
    if (!visibleIn) {
        return [];
    }
    if (guild.members.cache.size < guild.memberCount) {
        await guild.members.fetch().catch((error) =>
            logger.warn(`[Posts] Could not fetch the members of ${guild.id}: ${error.message}`));
    }
    return guild.members.cache
        .filter((member) => !member.user.bot && visibleIn.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel))
        .map((member) => member.id);
}

/** Refuses early, with a clear reason, where the bot could not post or keep a post up to date. */
function requireCanPost(ctx, channel) {
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
        throw new UserFacingError("Can't post here", "Boards can be posted in a server's text channels and threads.");
    }
    const permissions = ctx.interaction.appPermissions;
    const missing = permissions ? missingFrom(permissions, postingNeeds(channel)) : [];
    if (missing.length > 0) {
        throw new UserFacingError("Can't post here", `I'm missing ${listOf(missing)} in <#${channel.id}>, so I can't post `
            + "the board or keep it up to date there. A server manager can give me that in this "
            + (channel.isThread() ? "thread's channel." : "channel."));
    }
    if (channel.isThread() && channel.locked) {
        throw new UserFacingError("Can't post here", "This thread is locked, so I could not keep a post up to date.");
    }
}

/**
 * Refuses a channel chosen in a command option (a feed, the audit log channel) when the bot could not
 * post there, saying what to give it. Checked against the bot's own permissions in that channel, not
 * the one the command ran in. Lets it through when Discord has not told the bot about the channel.
 */
function requireCanPostIn(ctx, chosen) {
    const missing = missingIn(ctx.interaction.guild, chosen.id, postingNeeds);
    if (missing && missing.length > 0) {
        throw new UserFacingError("Can't post there", `I'm missing ${listOf(missing)} in <#${chosen.id}>. Give me that `
            + "there, or pick another channel.");
    }
}

/**
 * Who in the channel could not see the board, or null when everyone can. Asks as the user, who must
 * be allowed to post the board.
 */
async function hiddenAudience(ctx, boardId, channel) {
    const userIds = (await channelAudience(channel)).slice(0, AUDIENCE_MAX);
    if (userIds.length === 0) {
        return null;
    }
    const answer = await ctx.api.post(`/boards/${boardId}/posts/audience`, { body: { userIds } });
    return answer?.hidden > 0 ? answer : null;
}

/**
 * Posts the board in the channel and registers it, so it is kept up to date. The first drawing is
 * as the user sees the board; the bot redraws it from the whole board a moment later.
 *
 * @returns {Promise<{ message: import("discord.js").Message, board: object }>}
 */
async function postBoard(ctx, boardId, channel) {
    const model = snapshotModel(await getSnapshot(ctx, boardId, { fresh: true }));
    const message = await channel.send(v2Payload(buildBoardPost(model)));
    try {
        await ctx.api.post(`/boards/${boardId}/posts`, { body: { channelId: channel.id, messageId: message.id } });
    } catch (error) {
        // Without the post registered it would never update: better not to leave it there.
        await message.delete().catch(() => {});
        throw error;
    }
    return { message, board: model.board };
}

/** The channel the interaction happened in, fetched if it is not cached (a thread, say). */
async function interactionChannel(ctx) {
    return ctx.interaction.channel ?? ctx.client.channels.fetch(ctx.interaction.channelId).catch(() => null);
}

module.exports = { channelAudience, requireCanPost, requireCanPostIn, hiddenAudience, postBoard, interactionChannel };
