const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
const { webAppUrl } = require("../../config/env");
const { buildContainer, appendDivider, appendText, appendFooter } = require("../../ui/containers");

/**
 * The /help overview, built from the commands that are actually loaded so it never lists one that
 * does not exist.
 *
 * @param {import("discord.js").Collection<string, any>} commands
 */
function buildHelp(commands) {
    const container = buildContainer({
        title: "KanbanCord",
        body: "Kanban boards for your Discord server. Manage everything on the website; use these commands to work "
            + "with boards without leaving Discord.",
    });
    appendDivider(container);

    const lines = [...commands.values()]
        .sort((a, b) => a.data.name.localeCompare(b.data.name))
        .map((command) => {
            const json = command.data.toJSON();
            const subcommands = (json.options ?? []).filter((option) => option.type === 1);
            if (subcommands.length === 0) {
                return `**/${json.name}** — ${json.description}`;
            }
            return subcommands.map((sub) => `**/${json.name} ${sub.name}** — ${sub.description}`).join("\n");
        });
    appendText(container, lines.join("\n"));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Open KanbanCord").setURL(webAppUrl),
        ),
    );
    return appendFooter(container, "Found a problem or have an idea? Use /report.");
}

module.exports = { buildHelp };
