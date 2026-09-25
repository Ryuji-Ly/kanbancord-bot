const { InteractionContext } = require("../utils/interactionContext");
const { route } = require("../utils/interactionRouter");
const { warningContainer, v2Payload } = require("../ui/containers");
const logger = require("../utils/logger");

/**
 * Hands each interaction to its command or registered handler, and reports any failure to the user
 * in one consistent way. No command or handler catches errors just to tell the user.
 */
module.exports = {
    name: "interactionCreate",
    async execute(interaction, client) {
        const ctx = new InteractionContext(interaction);

        if (interaction.isAutocomplete()) {
            const command = client.commands.get(interaction.commandName);
            try {
                await command?.autocomplete?.(ctx);
            } catch (error) {
                logger.warn(`Autocomplete for /${interaction.commandName} failed: ${error.message}`);
                // An autocomplete that fails still has to answer, or Discord shows an error.
                await interaction.respond([]).catch(() => {});
            }
            return;
        }

        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) {
                logger.warn(`Unknown command: ${interaction.commandName}`);
                return;
            }
            try {
                await command.execute(ctx);
            } catch (error) {
                await ctx.fail(error);
            }
            return;
        }

        if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
            const { handler, id, outdated } = route(interaction);
            if (outdated) {
                await interaction
                    .reply(v2Payload(warningContainer("This has expired", "Run the command again to get a fresh one."), {
                        ephemeral: true,
                    }))
                    .catch(() => {});
                return;
            }
            if (!handler) {
                logger.warn(`No handler for ${interaction.customId}`);
                return;
            }
            try {
                await handler(ctx, id);
            } catch (error) {
                await ctx.fail(error);
            }
        }
    },
};
