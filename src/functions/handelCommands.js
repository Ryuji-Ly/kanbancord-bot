const fs = require("node:fs");
const path = require("node:path");
const { REST } = require("@discordjs/rest");
const { Routes } = require("discord-api-types/v10");
const { discordApplicationId, discordBotToken, discordGuildId } = require("../config/env");
const logger = require("../utils/logger");

module.exports = (client) => {
    client.handelCommands = async (commandFolders, commandsPath) => {
        const commandJson = [];

        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);
            if (!fs.statSync(folderPath).isDirectory()) {
                continue;
            }

            const commandFiles = fs.readdirSync(folderPath).filter((file) => file.endsWith(".js"));

            for (const file of commandFiles) {
                const command = require(path.join(folderPath, file));
                client.commands.set(command.data.name, command);
                commandJson.push(command.data.toJSON());
            }
        }

        const rest = new REST({ version: "10" }).setToken(discordBotToken);

        const route = discordGuildId
            ? Routes.applicationGuildCommands(discordApplicationId, discordGuildId)
            : Routes.applicationCommands(discordApplicationId);

        logger.info(
            `Refreshing ${commandJson.length} slash commands (${discordGuildId ? "guild" : "global"} scope)`,
        );

        await rest.put(route, { body: commandJson });
        logger.info("Slash command registration complete");
    };
};
