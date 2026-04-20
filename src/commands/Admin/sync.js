const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require("discord.js");
const { bootstrapServer } = require("../../services/internalSyncApi");
const { buildServerPayload, mapGuildMember, mapGuildRole } = require("../../utils/syncPayloads");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("sync")
        .setDescription("Internal KanbanCord sync operations")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false)
        .addSubcommand((subcommand) =>
            subcommand
                .setName("bootstrap")
                .setDescription("Push a full server snapshot to the backend")
                .addIntegerOption((option) =>
                    option
                        .setName("member_limit")
                        .setDescription("Optional cap to avoid huge first sync (default 500)")
                        .setMinValue(1)
                        .setMaxValue(2000),
                ),
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const subcommand = interaction.options.getSubcommand();
        if (subcommand !== "bootstrap") {
            await interaction.editReply("Unknown sync subcommand.");
            return;
        }

        try {
            const guild = await interaction.guild.fetch();
            const owner = await guild.fetchOwner();
            const memberLimit = interaction.options.getInteger("member_limit") ?? 500;

            const roles = await guild.roles.fetch();
            const roleEntries = roles
                .filter((role) => !role.managed)
                .map((role) => mapGuildRole(role));

            const members = await guild.members.fetch();
            const memberEntries = Array.from(members.values())
                .slice(0, memberLimit)
                .map((member) => mapGuildMember(member));

            const payload = {
                ...buildServerPayload(guild, owner),
                roles: roleEntries,
                members: memberEntries,
            };

            await bootstrapServer({
                serverId: guild.id,
                data: payload,
            });

            await interaction.editReply(
                `Bootstrap sync pushed for **${guild.name}**. Roles: ${roleEntries.length}, Members sent: ${memberEntries.length}.`,
            );
        } catch (error) {
            await interaction.editReply(`Sync failed: ${error.message}`);
        }
    },
};
