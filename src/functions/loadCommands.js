const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");
const { discordApplicationId, discordBotToken, discordGuildId } = require("../config/env");
const logger = require("../utils/logger");

const commandsPath = path.join(__dirname, "..", "commands");

/**
 * Loads every file in `commands/` onto `client.commands`. Each exports `data` (the slash command),
 * `execute(ctx)`, and optionally `autocomplete(interaction)`.
 */
function loadCommands(client) {
    const files = fs.readdirSync(commandsPath).filter((file) => file.endsWith(".js"));
    for (const file of files) {
        const command = require(path.join(commandsPath, file));
        if (!command.data || typeof command.execute !== "function") {
            throw new Error(`commands/${file} must export data and execute`);
        }
        client.commands.set(command.data.name, command);
    }
    logger.info(`Loaded ${client.commands.size} commands`);
}

/**
 * Registers the loaded commands with Discord: to one server when DISCORD_GUILD_ID is set (instant,
 * for development), otherwise globally. Run by one shard only.
 */
async function registerCommands(client) {
    const body = [...client.commands.values()].map((command) => command.data.toJSON());
    const rest = new REST({ version: "10" }).setToken(discordBotToken);
    const route = discordGuildId
        ? Routes.applicationGuildCommands(discordApplicationId, discordGuildId)
        : Routes.applicationCommands(discordApplicationId);

    logger.info(`Registering ${body.length} slash commands (${discordGuildId ? "guild" : "global"} scope)`);
    await rest.put(route, { body });
    logger.info("Slash command registration complete");
}

module.exports = { loadCommands, registerCommands };
