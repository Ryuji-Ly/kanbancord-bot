const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const { encode } = require("../utils/customId");
const { appendDivider, appendFooter, appendText, buildContainer, warningContainer } = require("./containers");

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

/**
 * @param {Record<string, boolean>} enabled every feature and whether it is on
 * @param {boolean} [open] whether open permissions are on
 */
function buildFeaturesPanel(enabled, open = false) {
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
    appendDivider(container);
    appendText(container, open
        ? "🔓 **Open permissions: on.** Everyone who can talk in this server may do anything with boards, columns and "
            + "tasks. Managing the server, board permissions, deleting or archiving boards and the audit log stay with "
            + "its managers."
        : "🔒 **Open permissions: off.** What people may do follows their Discord roles. Turning this on lets everyone "
            + "who can talk here do anything with boards, columns and tasks, like a simple shared list.");

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
                .setLabel("Everything on").setDisabled(everythingOn(enabled, open).every((key) => enabled[key])),
            open
                ? new ButtonBuilder().setCustomId(encode("feat", "close")).setStyle(ButtonStyle.Secondary)
                    .setLabel("Turn off open permissions")
                : new ButtonBuilder().setCustomId(encode("feat", "open")).setStyle(ButtonStyle.Danger)
                    .setLabel("Turn on open permissions"),
        ),
    );
    return appendFooter(container, "Boards can switch features off for themselves in their settings on the website.");
}

/**
 * Every feature, except custom permissions while open permissions are on: the two exclude each other,
 * and "everything on" never switches open permissions off behind anyone's back.
 */
function everythingOn(enabled, open) {
    return FEATURES.map((feature) => feature.key).filter((key) => !(open && key === "PERMISSIONS"));
}

/** Asked before turning open permissions on: it is a matter of trust, not of features. */
function openPermissionsWarning(customPermissionsOn) {
    const container = warningContainer(
        "Turn on open permissions?",
        "Everyone who can talk in this server will be able to create, change, move and delete boards' columns, tasks, "
            + "labels and priority levels, whatever their roles. Managing the server, board permissions, deleting or "
            + "archiving boards and the audit log stay with its managers.\n\nBest for a small group that trusts each "
            + "other."
            + (customPermissionsOn
                ? "\n\n**Custom permissions are on.** Turn them off first; their rules are kept for when you switch back."
                : ""),
    );
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(encode("feat", "openyes")).setStyle(ButtonStyle.Danger)
            .setLabel("Turn on").setDisabled(Boolean(customPermissionsOn)),
        new ButtonBuilder().setCustomId(encode("feat", "back")).setStyle(ButtonStyle.Secondary).setLabel("Cancel"),
    ));
    return container;
}

/** The request that makes exactly `keys` the features that are on. */
function featureChanges(keys) {
    const wanted = new Set(keys);
    return Object.fromEntries(FEATURES.map((feature) => [feature.key, wanted.has(feature.key)]));
}

module.exports = { FEATURES, buildFeaturesPanel, everythingOn, featureChanges, openPermissionsWarning };
