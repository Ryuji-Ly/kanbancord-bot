const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const { encode } = require("../utils/customId");
const { appendDivider, appendFooter, appendText, buildContainer } = require("./containers");

/**
 * /kanbancord features: which optional parts of KanbanCord the server uses. With none of them it is
 * in simple mode, the default for new servers.
 */

/** Every optional feature, in the order they are offered, with what it adds. */
const FEATURES = [
    { key: "ASSIGNEES", label: "Assignees", description: "Assign people and roles to tasks; they hear about them" },
    { key: "DUE_DATES", label: "Due dates", description: "Due dates, with reminders when they are close or past" },
    { key: "PRIORITIES", label: "Priorities", description: "Priority levels such as High and Low" },
    { key: "LABELS", label: "Labels", description: "Coloured labels to sort tasks by" },
    { key: "COMMENTS", label: "Comments", description: "Discuss tasks in comments" },
    { key: "PERMISSIONS", label: "Custom permissions", description: "Fine-tune who may do what, on the website" },
];

/** @param {Record<string, boolean>} enabled every feature and whether it is on */
function buildFeaturesPanel(enabled) {
    const on = FEATURES.filter((feature) => enabled[feature.key]);
    const container = buildContainer({
        title: "Features",
        body: on.length === 0
            ? "**Simple mode.** Boards have columns, and tasks have a title and a description; nothing else."
            : `**${on.length} of ${FEATURES.length} features on.**`,
    });
    appendDivider(container);
    appendText(container, FEATURES
        .map((feature) => `${enabled[feature.key] ? "✅" : "⬜"} **${feature.label}**: ${feature.description}`)
        .join("\n"));
    appendText(container, "-# New servers start in simple mode. Switching a feature off hides it everywhere without "
        + "deleting anything; switching it back on brings it all back.");

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
            .setCustomId(encode("feat", "set"))
            .setPlaceholder("Choose the features this server uses")
            .setMinValues(0)
            .setMaxValues(FEATURES.length)
            .addOptions(FEATURES.map((feature) => ({
                label: feature.label,
                description: feature.description,
                value: feature.key,
                default: Boolean(enabled[feature.key]),
            })))),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(encode("feat", "simple")).setStyle(ButtonStyle.Secondary)
                .setLabel("Simple mode").setDisabled(on.length === 0),
            new ButtonBuilder().setCustomId(encode("feat", "all")).setStyle(ButtonStyle.Secondary)
                .setLabel("Everything on").setDisabled(on.length === FEATURES.length),
        ),
    );
    return appendFooter(container, "Boards can switch features off for themselves in their settings on the website.");
}

/** The request that makes exactly `keys` the features that are on. */
function featureChanges(keys) {
    const wanted = new Set(keys);
    return Object.fromEntries(FEATURES.map((feature) => [feature.key, wanted.has(feature.key)]));
}

module.exports = { FEATURES, buildFeaturesPanel, featureChanges };
