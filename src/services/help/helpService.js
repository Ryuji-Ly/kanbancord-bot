const { ActionRowBuilder, ApplicationCommandOptionType, ButtonBuilder, ButtonStyle } = require("discord.js");
const { webAppUrl, supportServerUrl } = require("../../config/env");
const { buildContainer, appendDivider, appendText, appendFooter } = require("../../ui/containers");
const { UserFacingError } = require("../../utils/errorMessages");

/**
 * /help, built from the loaded commands so it never lists one that does not exist. Each command
 * describes itself in `info`:
 *
 *   info: {                                // a command without subcommands
 *     description: "What the command is for.",
 *     examples: ["/report type:Issue"],      // optional
 *     notes: "Anything worth knowing.",      // optional
 *   }
 *   info: { subcommands: { view: { description, examples, notes } } }  // one with subcommands
 *
 * A command with subcommands cannot be run on its own, so only its subcommands are listed.
 *
 * Usage lines are generated from the options, so they always match: <required> and [optional].
 */

const LEGEND = "<required> [optional]";

/** Each runnable command: `/help` and `/board view` alike. */
function listEntries(commands) {
    const entries = [];
    for (const command of commands.values()) {
        const json = command.data.toJSON();
        const subcommands = (json.options ?? []).filter((option) => option.type === ApplicationCommandOptionType.Subcommand);
        if (subcommands.length === 0) {
            entries.push({ path: json.name, parent: json.name, json, info: command.info ?? {} });
            continue;
        }
        for (const sub of subcommands) {
            entries.push({
                path: `${json.name} ${sub.name}`,
                parent: json.name,
                json: sub,
                info: command.info?.subcommands?.[sub.name] ?? {},
            });
        }
    }
    return entries.sort((a, b) => a.path.localeCompare(b.path));
}

/** `/board view <board>`: options in order, required ones in <>, optional ones in []. */
function usageOf(entry) {
    const options = (entry.json.options ?? []).map((option) => (option.required ? `<${option.name}>` : `[${option.name}]`));
    return [`/${entry.path}`, ...options].join(" ");
}

/** The overview: each command with a line per subcommand. */
function buildHelp(commands) {
    const container = buildContainer({
        title: "KanbanCord",
        body: "Kanban boards for your Discord server. Manage everything on the website; use these commands to work "
            + "with boards without leaving Discord.",
    });
    appendDivider(container);

    // A command with subcommands cannot be run on its own, so only the subcommands are listed,
    // grouped by the command they belong to.
    const entries = listEntries(commands);
    const parents = [...new Set(entries.map((entry) => entry.parent))];
    const blocks = parents.map((parent) =>
        entries
            .filter((entry) => entry.parent === parent)
            .map((entry) => `\`${usageOf(entry)}\` — ${entry.json.description}`)
            .join("\n"));
    appendText(container, blocks.join("\n\n"));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Open KanbanCord").setURL(webAppUrl),
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Support server").setURL(supportServerUrl),
        ),
    );
    return appendFooter(container, `${LEGEND} · /help <command> for details · Found a problem? Use /report or ask in the support server.`);
}

/** Details for one command (`board view`) or a command with subcommands (`board`). */
function buildHelpDetail(commands, path) {
    const wanted = String(path ?? "").trim().replace(/^\//, "").replace(/\s+/g, " ").toLowerCase();
    const entries = listEntries(commands);
    const entry = entries.find((candidate) => candidate.path === wanted);

    if (!entry) {
        const own = entries.filter((candidate) => candidate.parent === wanted);
        const suggestion = own.length > 0
            ? ` /${wanted} is always used with one of: ${own.map((sub) => `/${sub.path}`).join(", ")}.`
            : " Run /help to see every command.";
        throw new UserFacingError("No such command", `There is no /${wanted} on its own.${suggestion}`);
    }

    const container = buildContainer({ title: `/${entry.path}`, body: entry.info.description ?? entry.json.description });
    appendDivider(container);
    const sections = [`**Usage**\n\`${usageOf(entry)}\``];
    const options = entry.json.options ?? [];
    if (options.length > 0) {
        sections.push(`**Options**\n${options
            .map((option) => `- \`${option.name}\` — ${option.description}${option.required ? "" : " *(optional)*"}`)
            .join("\n")}`);
    }
    if (entry.info.examples?.length) {
        sections.push(`**Examples**\n${entry.info.examples.map((example) => `- \`${example}\``).join("\n")}`);
    }
    if (entry.info.notes) {
        sections.push(`**Notes**\n${entry.info.notes}`);
    }
    appendText(container, sections.join("\n\n"));
    return appendFooter(container, LEGEND);
}

/** Choices for /help's command option: every command and every subcommand. */
function helpChoices(commands, typed) {
    const query = String(typed ?? "").trim().replace(/^\//, "").toLowerCase();
    const entries = listEntries(commands);
    return entries
        .map((entry) => entry.path)
        .filter((candidate) => candidate.includes(query))
        .slice(0, 25)
        .map((candidate) => ({ name: `/${candidate}`, value: candidate }));
}

module.exports = { buildHelp, buildHelpDetail, helpChoices, listEntries, usageOf };
