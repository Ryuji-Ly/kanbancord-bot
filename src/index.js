const { Client, Collection, GatewayIntentBits, Options, Partials } = require("discord.js");
const { discordBotToken } = require("./config/env");
const { loadCommands, registerCommands } = require("./functions/loadCommands");
const { loadEvents } = require("./functions/loadEvents");
const { loadInteractions } = require("./functions/loadInteractions");
const logger = require("./utils/logger");

/** Never forget the bot itself: its member decides which channels it may post in. */
const notTheBot = (entity) => entity.id !== entity.client.user?.id;

/**
 * Members and users are only kept for a while: a server's full member list is fetched when it is
 * synced, but keeping every member of every server would make the bot's memory grow with their
 * total, not with how much KanbanCord is used. Code that needs members fetches them. Members that
 * are not kept arrive as partials in member events, so joins, leaves and role changes still come
 * through.
 */
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.GuildMember],
    makeCache: Options.cacheWithLimits({
        ...Options.DefaultMakeCacheSettings,
        GuildMemberManager: { maxSize: 200, keepOverLimit: (member) => !notTheBot(member) },
        UserManager: { maxSize: 5_000, keepOverLimit: (user) => !notTheBot(user) },
    }),
    sweepers: {
        ...Options.DefaultSweeperSettings,
        guildMembers: { interval: 1_800, filter: () => notTheBot },
        users: { interval: 1_800, filter: () => notTheBot },
    },
});

client.commands = new Collection();

(async () => {
    try {
        loadCommands(client);
        loadInteractions();
        loadEvents(client);
        // Every shard runs this file; registering commands once is enough.
        if (!client.shard || client.shard.ids.includes(0)) {
            await registerCommands(client);
        }
        await client.login(discordBotToken);
    } catch (error) {
        logger.error(`Failed to start bot: ${error.stack ?? error.message}`);
        process.exit(1);
    }
})();
