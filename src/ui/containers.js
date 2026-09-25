const { ContainerBuilder, MessageFlags, SeparatorSpacingSize } = require("discord.js");
const { COLORS } = require("./theme");

/**
 * Components V2 building blocks. Every reply is one or more containers; nothing uses embeds.
 * Builders return the live ContainerBuilder so callers can keep appending sections and buttons.
 */

/**
 * @param {{ title?: string, body?: string, accent?: number }} options
 * @returns {ContainerBuilder}
 */
function buildContainer({ title, body, accent = COLORS.brand } = {}) {
    const container = new ContainerBuilder().setAccentColor(accent);
    const text = [title ? `### ${title}` : null, body || null].filter(Boolean).join("\n");
    if (text) {
        container.addTextDisplayComponents((display) => display.setContent(text));
    }
    return container;
}

/** Appends a thin divider and a line of small text: containers have no footer of their own. */
function appendFooter(container, text) {
    return container
        .addSeparatorComponents((separator) => separator.setDivider(true).setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents((display) => display.setContent(`-# ${text}`));
}

function appendText(container, text) {
    return container.addTextDisplayComponents((display) => display.setContent(text));
}

function appendDivider(container) {
    return container.addSeparatorComponents((separator) => separator.setDivider(true));
}

const notice = (accent) => (title, body) => buildContainer({ title, body, accent });

const successContainer = notice(COLORS.success);
const errorContainer = notice(COLORS.error);
const warningContainer = notice(COLORS.warning);
const infoContainer = notice(COLORS.info);

/**
 * The message payload for containers.
 * @param {ContainerBuilder | ContainerBuilder[]} containers
 * @param {{ ephemeral?: boolean }} [options]
 */
function v2Payload(containers, { ephemeral = false } = {}) {
    const list = Array.isArray(containers) ? containers : [containers];
    let flags = MessageFlags.IsComponentsV2;
    if (ephemeral) {
        flags |= MessageFlags.Ephemeral;
    }
    return {
        components: list,
        flags,
        // Pings are opted into explicitly where they are meant; replies never ping by accident.
        allowedMentions: { parse: [] },
    };
}

module.exports = {
    buildContainer,
    appendFooter,
    appendText,
    appendDivider,
    successContainer,
    errorContainer,
    warningContainer,
    infoContainer,
    v2Payload,
};
