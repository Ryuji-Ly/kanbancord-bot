const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { respondBoardOptions } = require("../services/boards/autocomplete");
const flows = require("../services/boards/commandService");
const { boardOption, columnOption } = require("../utils/commandOptions");

const nameOption = (description) => (option) =>
    option.setName("name").setDescription(description).setRequired(true).setMaxLength(50);

module.exports = {
    data: new SlashCommandBuilder()
        .setName("column")
        .setDescription("Change a board's columns")
        .setContexts(InteractionContextType.Guild)
        .addSubcommand((sub) =>
            sub.setName("add").setDescription("Add a column at the end of a board")
                .addStringOption(boardOption())
                .addStringOption(nameOption("The new column's name")))
        .addSubcommand((sub) =>
            sub.setName("rename").setDescription("Rename a column")
                .addStringOption(boardOption())
                .addStringOption(columnOption())
                .addStringOption(nameOption("The new name")))
        .addSubcommand((sub) =>
            sub.setName("move").setDescription("Move a column to another position")
                .addStringOption(boardOption())
                .addStringOption(columnOption())
                .addIntegerOption((option) =>
                    option.setName("position").setDescription("Where it goes: 1 is the first column").setRequired(true).setMinValue(1)))
        .addSubcommand((sub) =>
            sub.setName("delete").setDescription("Delete a column and its tasks")
                .addStringOption(boardOption())
                .addStringOption(columnOption())),

    info: {
        subcommands: {
            add: {
                description: "Adds a column at the end of the board.",
                examples: ["/column add board:Sprint name:Review"],
            },
            rename: {
                description: "Gives a column a new name.",
                examples: ["/column rename board:Sprint column:Doing name:In progress"],
            },
            move: {
                description: "Moves a column to a position, counting from the left.",
                examples: ["/column move board:Sprint column:Review position:3"],
                notes: "A position past the end moves it to the end.",
            },
            delete: {
                description: "Asks for confirmation, then deletes the column and every task in it.",
                examples: ["/column delete board:Sprint column:Old"],
            },
        },
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        switch (ctx.interaction.options.getSubcommand()) {
            case "add":
                return flows.columnAdd(ctx);
            case "rename":
                return flows.columnRename(ctx);
            case "move":
                return flows.columnMove(ctx);
            case "delete":
                return flows.columnDelete(ctx);
        }
    },

    autocomplete: respondBoardOptions,
};
