const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { appendFooter, infoContainer, v2Payload } = require("../../ui/containers");
const { encode } = require("../../utils/customId");

/**
 * Suggests switching on a feature a board is doing by hand, such as tags like [M] at the start of task titles
 * for labels. The API works out what to suggest; this shows it privately after someone creates or edits a task,
 * with a button to switch each feature on (checked by the API when pressed) and one to dismiss them for the
 * board for good. Never public, never a ping.
 */

/** Short names, for buttons and sentences. */
const NAMES = { LABELS: "labels", PRIORITIES: "priorities", DUE_DATES: "due dates", ASSIGNEES: "assignees" };

/** What to do next once a feature is on. */
const NEXT = {
    LABELS: "Create labels with `/label create` and add them with `/task label`.",
    PRIORITIES: "Boards start with five levels; set one with `/task priority`.",
    DUE_DATES: "Set one with `/task due`; the people on a task are reminded before it is due.",
    ASSIGNEES: "Assign people with `/task assign`.",
};

/** When each person last saw a board's suggestions, so they come up at most once a day. Kept in memory only. */
const lastShown = new Map();
const QUIET_MS = 24 * 60 * 60 * 1000;

/** "[M], [S] and [E]"; examples with spaces in quotes. */
function exampleList(examples) {
    const quoted = examples.map((example) => `\`${(/\s/.test(example) ? `"${example}"` : example).replaceAll("`", "'")}\``);
    return quoted.length > 1 ? `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}` : quoted.join("");
}

function sentence({ feature, signal, examples }) {
    const list = exampleList(examples);
    switch (feature) {
        case "LABELS":
            return signal === "COLUMNS"
                ? `Columns like ${list} sort tasks into categories. **Labels** can do that instead, so columns can show how far each task is.`
                : `Several tasks start with tags like ${list}. **Labels** can do that for you, in colour, and let you filter by them.`;
        case "PRIORITIES":
            return `Several tasks are marked ${list}. **Priorities** can do that for you, and let you filter by them.`;
        case "DUE_DATES":
            return `Several tasks have deadlines written in them, like ${list}. **Due dates** can do that for you, and remind people before a task is due.`;
        case "ASSIGNEES":
            return signal === "COLUMNS"
                ? `Columns like ${list} are named after people. **Assignees** can show who does what, so columns can show how far each task is.`
                : `Several tasks say who does them, like ${list}. **Assignees** can do that for you, and the people assigned hear about their tasks.`;
        default:
            return null;
    }
}

/**
 * The suggestions as a private message, or null when there are none.
 * @param {Array<{feature: string, signal: string, examples: string[], scope: string}>} suggestions
 * @param {string|number} boardId
 * @param {string} [notice] what just happened, shown first
 */
function suggestionsView(suggestions, boardId, notice) {
    const lines = suggestions.map(sentence).filter(Boolean);
    if (lines.length === 0) {
        return null;
    }
    const container = infoContainer("Tip: KanbanCord can do this for you", [notice, ...lines].filter(Boolean).join("\n\n"));
    const known = suggestions.filter((suggestion) => NAMES[suggestion.feature]);
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        ...known.slice(0, 4).map((suggestion) => new ButtonBuilder()
            .setCustomId(encode("fsug", "on", boardId, suggestion.feature))
            .setStyle(ButtonStyle.Primary)
            .setLabel(`Turn on ${NAMES[suggestion.feature]}`)),
        new ButtonBuilder()
            .setCustomId(encode("fsug", "dismiss", boardId, known.map((suggestion) => suggestion.feature).join(".")))
            .setStyle(ButtonStyle.Secondary)
            .setLabel("Dismiss"),
    ));
    return appendFooter(container, "Server managers can also switch features on with `/kanbancord features`. "
        + "Dismissed suggestions do not come back on this board.");
}

async function loadSuggestions(ctx, boardId) {
    const result = await ctx.api.get(`/boards/${boardId}/feature-suggestions`);
    return result?.suggestions ?? [];
}

/**
 * Sends the board's suggestions to the user privately, unless they saw them in the last day. Never fails: a tip
 * is not worth breaking a command over.
 */
async function sendFeatureSuggestions(ctx, boardId) {
    const key = `${ctx.user.id}:${boardId}`;
    const now = Date.now();
    if (now - (lastShown.get(key) ?? 0) < QUIET_MS) {
        return;
    }
    try {
        const view = suggestionsView(await loadSuggestions(ctx, boardId), boardId);
        if (!view) {
            return;
        }
        lastShown.set(key, now);
        await ctx.interaction.followUp(v2Payload(view, { ephemeral: true }));
    } catch {
        // Nothing to suggest, or the API is busy: the task itself was saved.
    }
}

/** For tests. */
function forgetShown() {
    lastShown.clear();
}

module.exports = { NAMES, NEXT, forgetShown, loadSuggestions, sendFeatureSuggestions, suggestionsView };
