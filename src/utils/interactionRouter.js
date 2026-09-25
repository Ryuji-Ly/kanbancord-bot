const { decode } = require("./customId");

/**
 * Routes buttons, select menus and modal submissions to the feature that created them, by the
 * feature name in their custom id. Features register once, when their file in `interactions/` is
 * loaded; `events/interactionCreate.js` only ever calls `route`.
 */

const componentHandlers = new Map();
const modalHandlers = new Map();

/**
 * @param {string} feature
 * @param {(ctx: import("./interactionContext").InteractionContext, id: { action: string, args: string[] }) => Promise<void>} handler
 */
function registerComponentHandler(feature, handler) {
    if (componentHandlers.has(feature)) {
        throw new Error(`Component handler already registered for ${feature}`);
    }
    componentHandlers.set(feature, handler);
}

/** Like registerComponentHandler, for modal submissions. */
function registerModalHandler(feature, handler) {
    if (modalHandlers.has(feature)) {
        throw new Error(`Modal handler already registered for ${feature}`);
    }
    modalHandlers.set(feature, handler);
}

/**
 * Finds the handler for a component or modal interaction.
 * @returns {{ handler?: Function, id?: ReturnType<typeof decode>, outdated: boolean }}
 */
function route(interaction) {
    const id = decode(interaction.customId);
    if (!id) {
        return { outdated: false };
    }
    if (!id.current) {
        return { id, outdated: true };
    }
    const handlers = interaction.isModalSubmit() ? modalHandlers : componentHandlers;
    return { handler: handlers.get(id.feature), id, outdated: false };
}

module.exports = { registerComponentHandler, registerModalHandler, route };
