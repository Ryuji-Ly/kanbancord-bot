const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { respondBoardOptions } = require("../services/boards/autocomplete");
const { taskView } = require("../services/boards/viewService");
const flows = require("../services/boards/commandService");
const { boardOption, columnOption, withBoardAndTask } = require("../utils/commandOptions");
const { EXAMPLES } = require("../utils/dueDate");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("task")
        .setDescription("Work with tasks on a board")
        .setContexts(InteractionContextType.Guild)
        .addSubcommand((sub) =>
            sub.setName("create").setDescription("Add a task to a board")
                .addStringOption(boardOption())
                .addStringOption(columnOption("The column to add it to (the first one if left out)", false)))
        .addSubcommand((sub) => withBoardAndTask(sub.setName("view").setDescription("Show a task in full")))
        .addSubcommand((sub) => withBoardAndTask(sub.setName("edit").setDescription("Change a task's title and description")))
        .addSubcommand((sub) =>
            withBoardAndTask(sub.setName("move").setDescription("Move a task to another column"))
                .addStringOption(columnOption("The column to move it to")))
        .addSubcommand((sub) =>
            withBoardAndTask(sub.setName("assign").setDescription("Assign someone (you, if nobody is given) or a role"))
                .addUserOption((option) => option.setName("user").setDescription("Who to assign"))
                .addRoleOption((option) => option.setName("role").setDescription("A role to assign")))
        .addSubcommand((sub) =>
            withBoardAndTask(sub.setName("unassign").setDescription("Unassign someone (you, if nobody is given) or a role"))
                .addUserOption((option) => option.setName("user").setDescription("Who to unassign"))
                .addRoleOption((option) => option.setName("role").setDescription("A role to unassign")))
        .addSubcommand((sub) =>
            withBoardAndTask(sub.setName("label").setDescription("Add a label to a task, or remove it if it has it"))
                .addStringOption((option) =>
                    option.setName("label").setDescription("The label").setRequired(true).setAutocomplete(true)))
        .addSubcommand((sub) =>
            withBoardAndTask(sub.setName("priority").setDescription("Set a task's priority"))
                .addStringOption((option) =>
                    option.setName("priority").setDescription("The priority, or No priority").setRequired(true).setAutocomplete(true)))
        .addSubcommand((sub) =>
            withBoardAndTask(sub.setName("due").setDescription("Set or remove a task's due date"))
                .addStringOption((option) =>
                    option.setName("when").setDescription(`When, in UTC: ${EXAMPLES}`).setRequired(true).setMaxLength(40)))
        .addSubcommand((sub) => withBoardAndTask(sub.setName("delete").setDescription("Delete a task"))),

    info: {
        subcommands: {
            create: {
                description: "Opens a form for the new task's title and description, then shows the task.",
                examples: ["/task create board:Sprint", "/task create board:Sprint column:Doing"],
            },
            view: {
                description: "Shows a task's details, description, images and who is assigned. Its menu makes "
                    + "every change you may make, and its buttons show comments or open it on the website.",
                examples: ["/task view board:Sprint task:Fix login"],
                notes: "Pick the board first; the task list then shows that board's tasks.",
            },
            edit: {
                description: "Opens a form with the task's title and description to change them.",
                examples: ["/task edit board:Sprint task:Fix login"],
                notes: "Descriptions longer than a Discord form can hold (4000 characters) can only be edited on the website.",
            },
            move: {
                description: "Moves the task to the bottom of another column.",
                examples: ["/task move board:Sprint task:Fix login column:Done"],
            },
            assign: {
                description: "Assigns a person, a role, or both. With neither, assigns you.",
                examples: ["/task assign board:Sprint task:Fix login", "/task assign board:Sprint task:Fix login user:@Mia"],
                notes: "Assigning a role only shows who the task is for; it gives the role nothing.",
            },
            unassign: {
                description: "Unassigns a person, a role, or both. With neither, unassigns you.",
                examples: ["/task unassign board:Sprint task:Fix login"],
            },
            label: {
                description: "Adds the label to the task, or takes it off if the task already has it.",
                examples: ["/task label board:Sprint task:Fix login label:Bug"],
            },
            priority: {
                description: "Sets the task's priority level, or removes it with No priority.",
                examples: ["/task priority board:Sprint task:Fix login priority:High"],
            },
            due: {
                description: "Sets when the task is due, or removes the due date with none.",
                examples: ["/task due board:Sprint task:Fix login when:tomorrow", "/task due board:Sprint task:Fix login when:2026-10-01 17:00"],
                notes: "Times are in UTC; the reply shows the result in your own time zone to check. "
                    + "A date on its own is due at the end of that day.",
            },
            delete: {
                description: "Asks for confirmation, then deletes the task and its comments.",
                examples: ["/task delete board:Sprint task:Old idea"],
            },
        },
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        const options = ctx.interaction.options;
        switch (options.getSubcommand()) {
            case "create":
                return flows.taskCreate(ctx);
            case "view":
                await ctx.defer();
                return ctx.reply(await taskView(ctx, options.getString("board", true), options.getString("task", true)));
            case "edit":
                return flows.taskEdit(ctx);
            case "move":
                return flows.taskMove(ctx);
            case "assign":
                return flows.taskAssign(ctx, true);
            case "unassign":
                return flows.taskAssign(ctx, false);
            case "label":
                return flows.taskLabel(ctx);
            case "priority":
                return flows.taskPriority(ctx);
            case "due":
                return flows.taskDue(ctx);
            case "delete":
                return flows.taskDelete(ctx);
        }
    },

    autocomplete: respondBoardOptions,
};
