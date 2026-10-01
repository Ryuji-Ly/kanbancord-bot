const { ApplicationCommandType, ContextMenuCommandBuilder, InteractionContextType } = require("discord.js");
const { draftFromMessage, saveDraft } = require("../services/boards/messageTask");
const { boardPicker, openDraftForm, taskBoards } = require("../interactions/messageTask");

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName("Create task")
        .setType(ApplicationCommandType.Message)
        .setContexts(InteractionContextType.Guild),

    info: {
        description: "Turns the message into a task: a short message becomes the title, a longer one the description, "
            + "with a link back to the message.",
    },

    /**
     * Opens the new-task form straight away when there is only one board to choose; otherwise asks
     * which board first, with boards posted in this channel offered first.
     *
     * @param {import("../utils/interactionContext").InteractionContext} ctx
     */
    async execute(ctx) {
        const draft = draftFromMessage(ctx.interaction.targetMessage);
        const { boards, posted } = await taskBoards(ctx);
        if (boards.length === 1) {
            return openDraftForm(ctx, boards[0].boardId, draft);
        }
        await ctx.reply(boardPicker(saveDraft(ctx.user.id, draft), draft, boards, posted), { ephemeral: true });
    },
};
