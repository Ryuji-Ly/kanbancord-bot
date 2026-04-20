const { SlashCommandBuilder, MessageFlags } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("boards")
        .setDescription("Manage KanbanCord boards")
        .setDMPermission(false)
        .addSubcommand((sub) =>
            sub.setName("list").setDescription("List all boards for this server"),
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.editReply("Board commands coming soon.");
    },
};
