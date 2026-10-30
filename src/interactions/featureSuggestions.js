const { registerComponentHandler } = require("../utils/interactionRouter");
const { NAMES, NEXT, loadSuggestions, suggestionsView } = require("../services/guide/featureSuggestions");
const { successContainer } = require("../ui/containers");
const { UserFacingError } = require("../utils/errorMessages");

/**
 * The buttons on a feature suggestion. Switching on goes to the server's features when the server has the feature
 * off, or to the board's own when only the board does; the API decides who may, and anyone it refuses is told who
 * can and how.
 */

async function switchOn(ctx, boardId, feature) {
    const server = await ctx.api.get("/features");
    const forServer = !server?.[feature];
    try {
        if (forServer) {
            await ctx.api.put("/features", { body: { [feature]: true } });
        } else {
            await ctx.api.put(`/boards/${boardId}/features`, { body: { [feature]: true } });
        }
    } catch (error) {
        if (error?.status !== 403) {
            throw error;
        }
        throw forServer
            ? new UserFacingError("Ask a server manager",
                `Switching on ${NAMES[feature]} is for someone with **Manage Server**. They can press this button on a `
                + "suggestion of their own, run `/kanbancord features`, or use Server settings → Features on the website.")
            : new UserFacingError("Ask whoever runs this board",
                `${NAMES[feature][0].toUpperCase()}${NAMES[feature].slice(1)} are on for the server but off for this `
                + "board. Someone who can edit the board can switch them on in Board settings → Simple mode on the website.");
    }
}

registerComponentHandler("fsug", async (ctx, { action, args }) => {
    const [boardId, features] = args;
    switch (action) {
        case "on": {
            if (!NAMES[features]) {
                throw new UserFacingError("Not available", "That feature cannot be switched on here.");
            }
            await ctx.deferUpdate();
            await switchOn(ctx, boardId, features);
            const done = `**${NAMES[features][0].toUpperCase()}${NAMES[features].slice(1)} are on.** ${NEXT[features]}`;
            const rest = suggestionsView(await loadSuggestions(ctx, boardId).catch(() => []), boardId, done);
            return ctx.update(rest ?? successContainer(null, done));
        }
        case "dismiss": {
            const keys = String(features ?? "").split(".").filter((key) => NAMES[key]);
            await ctx.deferUpdate();
            if (keys.length > 0) {
                await ctx.api.post(`/boards/${boardId}/feature-suggestions/dismiss`, { body: { features: keys } });
            }
            return ctx.update(successContainer(null, "Dismissed. KanbanCord will not suggest these on this board again; "
                + "`/kanbancord features` switches features on whenever you want them."));
        }
        default:
            throw new UserFacingError("Not available", "That action is not available here.");
    }
});
