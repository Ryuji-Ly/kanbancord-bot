const { SlashCommandBuilder, MessageFlags } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("tasks")
        .setDescription("Manage tasks")
        .setDMPermission(false)
        .addSubcommand((sub) =>
            sub
                .setName("list")
                .setDescription("List tasks in a column")
                .addStringOption((opt) =>
                    opt.setName("column_id").setDescription("Column ID").setRequired(true),
                ),
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.editReply("Task commands coming soon.");
    },
};
