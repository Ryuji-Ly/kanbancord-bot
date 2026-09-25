const { Client, Collection, GatewayIntentBits } = require("discord.js");
const { discordBotToken } = require("./config/env");
const { loadCommands, registerCommands } = require("./functions/loadCommands");
const { loadEvents } = require("./functions/loadEvents");
const { loadInteractions } = require("./functions/loadInteractions");
const logger = require("./utils/logger");

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
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
