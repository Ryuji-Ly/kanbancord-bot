const { MessageFlags } = require("discord.js");
const { forUser } = require("../api/kanbanApi");
const { errorContainer, v2Payload } = require("../ui/containers");
const { describeError } = require("./errorMessages");
const logger = require("./logger");

/**
 * Everything a command or component handler needs from an interaction, so handlers never juggle
 * reply/defer/edit state themselves. Every response is sent as Components V2 containers.
 */
class InteractionContext {
    /** @param {import("discord.js").Interaction} interaction */
    constructor(interaction) {
        this.interaction = interaction;
    }

    get user() {
        return this.interaction.user;
    }

    get guildId() {
        return this.interaction.guildId;
    }

    get client() {
        return this.interaction.client;
    }

    /** The KanbanCord API as the user who ran the command, in the server it ran in. */
    get api() {
        if (!this.guildId) {
            throw new Error("The KanbanCord API needs a server; this command ran outside one");
        }
        this._api ??= forUser({ userId: this.user.id, guildId: this.guildId });
        return this._api;
    }

    /** Acknowledges now and answers later, for anything that calls the API. */
    async defer({ ephemeral = true } = {}) {
        if (this.interaction.deferred || this.interaction.replied) {
            return;
        }
        await this.interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined });
    }

    /**
     * Sends the response, or replaces it if one was already sent or deferred. A deferred reply keeps
     * the visibility it was deferred with.
     */
    async reply(containers, { ephemeral = true } = {}) {
        const payload = v2Payload(containers, { ephemeral });
        if (this.interaction.deferred || this.interaction.replied) {
            // Ephemerality is fixed when a reply is first sent; editReply rejects the flag.
            payload.flags &= ~MessageFlags.Ephemeral;
            return this.interaction.editReply(payload);
        }
        return this.interaction.reply(payload);
    }

    /** Replaces the message a button or menu belongs to. */
    async update(containers) {
        const payload = v2Payload(containers);
        if (this.interaction.deferred || this.interaction.replied) {
            return this.interaction.editReply(payload);
        }
        return this.interaction.update(payload);
    }

    /** Opens a modal; only possible as the first response to an interaction. */
    async showModal(modal) {
        return this.interaction.showModal(modal);
    }

    /**
     * Tells the user what went wrong, in place of whatever they were waiting for. Unexpected
     * failures are logged with their details; expected ones (no permission, not found) are not.
     */
    async fail(error) {
        const { title, body, unexpected } = describeError(error);
        if (unexpected) {
            logger.error(`[${this.describe()}] ${error?.stack ?? error}`);
        }
        const payload = v2Payload(errorContainer(title, body), { ephemeral: true });
        try {
            if (this.interaction.deferred || this.interaction.replied) {
                await this.interaction.followUp(payload);
            } else if (this.interaction.isRepliable()) {
                await this.interaction.reply(payload);
            }
        } catch (sendError) {
            logger.warn(`[${this.describe()}] Could not report an error: ${sendError.message}`);
        }
    }

    /** A short label for logs: the command, or the component's id. */
    describe() {
        const interaction = this.interaction;
        if (interaction.isChatInputCommand?.()) {
            const sub = interaction.options.getSubcommand(false);
            return `/${interaction.commandName}${sub ? ` ${sub}` : ""}`;
        }
        return interaction.customId ?? interaction.type;
    }
}

module.exports = { InteractionContext };
