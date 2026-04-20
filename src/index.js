const fs = require("node:fs");
const path = require("node:path");
const { Client, Collection, GatewayIntentBits } = require("discord.js");
const { discordBotToken } = require("./config/env");
const logger = require("./utils/logger");

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.commands = new Collection();

const functionsPath = path.join(__dirname, "functions");
const eventsPath = path.join(__dirname, "events");
const commandsPath = path.join(__dirname, "commands");

const functionFiles = fs.readdirSync(functionsPath).filter((file) => file.endsWith(".js"));
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"));
const commandFolders = fs.readdirSync(commandsPath);

(async () => {
    try {
        for (const file of functionFiles) {
            require(path.join(functionsPath, file))(client);
        }

        await client.handelEvents(eventFiles, eventsPath);
        await client.handelCommands(commandFolders, commandsPath);
        await client.login(discordBotToken);
    } catch (error) {
        logger.error(`Failed to start bot: ${error.message}`);
        process.exit(1);
    }
})();
