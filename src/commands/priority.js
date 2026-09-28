const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { respondBoardOptions } = require("../services/boards/autocomplete");
const flows = require("../services/boards/labelFlows");
const { boardOption } = require("../utils/commandOptions");

const priorityOption = (option) =>
    option.setName("priority").setDescription("The priority level").setRequired(true).setAutocomplete(true);

const colorOption = (description) => (option) =>
    option.setName("color").setDescription(description).setAutocomplete(true);

const positionOption = (description, required) => (option) =>
    option.setName("position").setDescription(description).setRequired(required).setMinValue(1);

module.exports = {
    data: new SlashCommandBuilder()
        .setName("priority")
        .setDescription("Manage a board's priority levels")
        .setContexts(InteractionContextType.Guild)
        .addSubcommand((sub) =>
            sub.setName("list").setDescription("Show a board's priority levels, most urgent first")
                .addStringOption(boardOption()))
        .addSubcommand((sub) =>
            sub.setName("create").setDescription("Add a priority level to a board")
                .addStringOption(boardOption())
                .addStringOption((option) =>
                    option.setName("name").setDescription("The level's name").setRequired(true).setMaxLength(50))
                .addStringOption(colorOption("A colour from the list, or a hex colour; grey if left out"))
                .addIntegerOption(positionOption("Where it goes: 1 is the most urgent; the bottom if left out", false)))
        .addSubcommand((sub) =>
            sub.setName("edit").setDescription("Rename a priority level or change its colour")
                .addStringOption(boardOption())
                .addStringOption(priorityOption)
                .addStringOption((option) =>
                    option.setName("name").setDescription("The new name").setMaxLength(50))
                .addStringOption(colorOption("The new colour")))
        .addSubcommand((sub) =>
            sub.setName("move").setDescription("Move a priority level up or down the list")
                .addStringOption(boardOption())
                .addStringOption(priorityOption)
                .addIntegerOption(positionOption("Where it goes: 1 is the most urgent", true)))
        .addSubcommand((sub) =>
            sub.setName("delete").setDescription("Delete a priority level")
                .addStringOption(boardOption())
                .addStringOption(priorityOption)),

    info: {
        subcommands: {
            list: {
                description: "Shows the board's priority levels in order, most urgent first, and how many tasks have each.",
                examples: ["/priority list board:Sprint"],
            },
            create: {
                description: "Adds a priority level, ready to set on tasks with `/task priority`.",
                examples: ["/priority create board:Sprint name:Urgent color:Red position:1", "/priority create board:Sprint name:Someday"],
                notes: "New boards start with Critical, High, Medium, Low and Ignorable. Names must be different from the board's other levels.",
            },
            edit: {
                description: "Renames a priority level, changes its colour, or both. Tasks that have it keep it.",
                examples: ["/priority edit board:Sprint priority:High name:Important"],
            },
            move: {
                description: "Moves a priority level to a position in the list, counting from the most urgent.",
                examples: ["/priority move board:Sprint priority:Low position:2"],
                notes: "A position past the end moves it to the bottom.",
            },
            delete: {
                description: "Asks for confirmation, then deletes the level. Tasks that had it are left with no priority.",
                examples: ["/priority delete board:Sprint priority:Ignorable"],
            },
        },
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        switch (ctx.interaction.options.getSubcommand()) {
            case "list":
                return flows.priorityList(ctx);
            case "create":
                return flows.priorityCreate(ctx);
            case "edit":
                return flows.priorityEdit(ctx);
            case "move":
                return flows.priorityMove(ctx);
            case "delete":
                return flows.priorityDelete(ctx);
        }
    },

    autocomplete: respondBoardOptions,
};
