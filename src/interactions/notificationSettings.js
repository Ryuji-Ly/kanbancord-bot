const { MessageFlags } = require("discord.js");
const { forUser } = require("../api/kanbanApi");
const { registerComponentHandler } = require("../utils/interactionRouter");
const { DM_MODES, SERVER_MODES, mySettings, setDmMode, setServerMode } = require("../services/settings/notificationSettings");
const { buildDmOptOutPanel, buildMyNotificationsPanel } = require("../ui/settingsViews");
const { UserFacingError } = require("../utils/errorMessages");

/** The /notifications panel's menus: each change is saved, then the panel shows the result. */
registerComponentHandler("ntf", async (ctx, { action }) => {
    const choice = ctx.interaction.values?.[0];
    await ctx.deferUpdate();
    if (action === "mode") {
        await setDmMode(ctx, choice);
    } else if (action === "server") {
        await setServerMode(ctx, choice);
    } else {
        throw new UserFacingError("Not available", "That setting is not available here.");
    }
    await ctx.update(buildMyNotificationsPanel(await mySettings(ctx), ctx.guildId, ctx.interaction.guild?.name));
});

/**
 * The opt-out on a direct message, and the buttons of its answer. A direct message belongs to no
 * server, so the server is in the button: `dm:server:<serverId>:<mode>` sets how much that server may
 * message you, `dm:all:<serverId>:<mode>` sets direct messages as a whole.
 */
registerComponentHandler("dm", async (ctx, { action, args: [serverId, mode] }) => {
    const valid = action === "server" ? SERVER_MODES.includes(mode) : action === "all" && DM_MODES.includes(mode);
    if (!serverId || !valid) {
        throw new UserFacingError("Not available", "That setting is not available here.");
    }
    // The first click answers privately below the direct message; later clicks change that answer.
    const onAnswer = Boolean(ctx.interaction.message?.flags?.has(MessageFlags.Ephemeral));
    if (onAnswer) {
        await ctx.deferUpdate();
    } else {
        await ctx.defer({ ephemeral: true });
    }

    const api = forUser({ userId: ctx.user.id, guildId: serverId });
    const before = await api.myNotifications.get();
    const changes = action === "server" ? { servers: { [serverId]: mode } } : { dmMode: mode };
    const after = await api.myNotifications.update(changes);
    const undo = action === "server"
        ? ["server", serverId, before.servers?.[serverId] ?? "DEFAULT"]
        : ["all", serverId, before.dmMode ?? "UNLESS_PINGED"];
    const panel = buildDmOptOutPanel({
        serverId,
        serverName: ctx.client.guilds.cache.get(serverId)?.name ?? null,
        serverMode: after.servers?.[serverId] ?? "DEFAULT",
        dmMode: after.dmMode,
        undo,
    });
    await (onAnswer ? ctx.update(panel) : ctx.reply(panel));
});
