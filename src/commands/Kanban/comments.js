const { SlashCommandBuilder, MessageFlags } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("comments")
        .setDescription("Manage task comments")
        .setDMPermission(false)
        .addSubcommand((sub) =>
            sub
                .setName("list")
                .setDescription("List comments on a task")
                .addStringOption((opt) =>
                    opt.setName("task_id").setDescription("Task ID").setRequired(true),
                ),
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await interaction.editReply("Comment commands coming soon.");
    },
};
