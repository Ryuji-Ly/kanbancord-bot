const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { respondBoardOptions } = require("../services/boards/autocomplete");
const flows = require("../services/boards/labelFlows");
const { boardOption } = require("../utils/commandOptions");

const labelOption = (option) =>
    option.setName("label").setDescription("The label").setRequired(true).setAutocomplete(true);

const colorOption = (description) => (option) =>
    option.setName("color").setDescription(description).setAutocomplete(true);

module.exports = {
    data: new SlashCommandBuilder()
        .setName("label")
        .setDescription("Manage a board's labels")
        .setContexts(InteractionContextType.Guild)
        .addSubcommand((sub) =>
            sub.setName("list").setDescription("Show a board's labels")
                .addStringOption(boardOption()))
        .addSubcommand((sub) =>
            sub.setName("create").setDescription("Add a label to a board")
                .addStringOption(boardOption())
                .addStringOption((option) =>
                    option.setName("name").setDescription("The label's name").setRequired(true).setMaxLength(50))
                .addStringOption(colorOption("A colour from the list, or a hex colour; one is picked if left out")))
        .addSubcommand((sub) =>
            sub.setName("edit").setDescription("Rename a label or change its colour")
                .addStringOption(boardOption())
                .addStringOption(labelOption)
                .addStringOption((option) =>
                    option.setName("name").setDescription("The new name").setMaxLength(50))
                .addStringOption(colorOption("The new colour")))
        .addSubcommand((sub) =>
            sub.setName("delete").setDescription("Delete a label and take it off every task")
                .addStringOption(boardOption())
                .addStringOption(labelOption)),

    info: {
        subcommands: {
            list: {
                description: "Shows every label on the board, with its colour and how many tasks have it.",
                examples: ["/label list board:Sprint"],
            },
            create: {
                description: "Adds a label to the board, ready to put on tasks with `/task label`.",
                examples: ["/label create board:Sprint name:Bug color:Red", "/label create board:Sprint name:Design color:#9333ea"],
                notes: "Without a colour, the one the board uses least is picked. Names must be different from the board's other labels.",
            },
            edit: {
                description: "Renames a label, changes its colour, or both. Tasks that have it keep it.",
                examples: ["/label edit board:Sprint label:Bug name:Defect", "/label edit board:Sprint label:Bug color:Orange"],
            },
            delete: {
                description: "Asks for confirmation, then deletes the label and takes it off every task that has it.",
                examples: ["/label delete board:Sprint label:Old"],
            },
        },
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        switch (ctx.interaction.options.getSubcommand()) {
            case "list":
                return flows.labelList(ctx);
            case "create":
                return flows.labelCreate(ctx);
            case "edit":
                return flows.labelEdit(ctx);
            case "delete":
                return flows.labelDelete(ctx);
        }
    },

    autocomplete: respondBoardOptions,
};
