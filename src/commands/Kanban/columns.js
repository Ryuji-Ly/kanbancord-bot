const { SlashCommandBuilder, MessageFlags } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("columns")
        .setDescription("Manage board columns")
        .setDMPermission(false)
        .addSubcommand((sub) =>
            sub
                .setName("list")
                .setDescription("List columns for a board")
                .addStringOption((opt) =>
                    opt.setName("board_id").setDescription("Board ID").setRequired(true),
                ),
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.editReply("Column commands coming soon.");
    },
};
