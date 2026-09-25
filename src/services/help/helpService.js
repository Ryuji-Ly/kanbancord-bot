const { ActionRowBuilder, ApplicationCommandOptionType, ButtonBuilder, ButtonStyle } = require("discord.js");
const { webAppUrl } = require("../../config/env");
const { buildContainer, appendDivider, appendText, appendFooter } = require("../../ui/containers");
const { UserFacingError } = require("../../utils/errorMessages");

/**
 * /help, built from the loaded commands so it never lists one that does not exist. Each command
 * describes itself in `info`:
 *
 *   info: {
 *     description: "What the command is for.",
 *     examples: ["/report type:Issue"],      // optional
 *     notes: "Anything worth knowing.",      // optional
 *     subcommands: { view: { description, examples, notes } },  // for commands with subcommands
 *   }
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

function commandInfo(commands, name) {
    return commands.get(name)?.info ?? {};
}

/** The overview: each command with a line per subcommand. */
function buildHelp(commands) {
    const container = buildContainer({
        title: "KanbanCord",
        body: "Kanban boards for your Discord server. Manage everything on the website; use these commands to work "
            + "with boards without leaving Discord.",
    });
    appendDivider(container);

    const entries = listEntries(commands);
    const parents = [...new Set(entries.map((entry) => entry.parent))];
    const blocks = parents.map((parent) => {
        const own = entries.filter((entry) => entry.parent === parent);
        const lines = own.map((entry) => `\`${usageOf(entry)}\` — ${entry.json.description}`);
        const about = own.length > 1 ? commandInfo(commands, parent).description : null;
        return [about ? `**/${parent}** — ${about}` : null, ...lines].filter(Boolean).join("\n");
    });
    appendText(container, blocks.join("\n\n"));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Open KanbanCord").setURL(webAppUrl),
        ),
    );
    return appendFooter(container, `${LEGEND} · /help <command> for details · Found a problem? Use /report.`);
}

/** Details for one command (`board view`) or a command with subcommands (`board`). */
function buildHelpDetail(commands, path) {
    const wanted = String(path ?? "").trim().replace(/^\//, "").replace(/\s+/g, " ").toLowerCase();
    const entries = listEntries(commands);
    const entry = entries.find((candidate) => candidate.path === wanted);

    if (!entry) {
        const own = entries.filter((candidate) => candidate.parent === wanted);
        if (own.length === 0) {
            throw new UserFacingError("No such command", `There is no /${wanted}. Run /help to see every command.`);
        }
        const container = buildContainer({ title: `/${wanted}`, body: commandInfo(commands, wanted).description });
        appendDivider(container);
        appendText(container, own.map((sub) => `\`${usageOf(sub)}\` — ${sub.info.description ?? sub.json.description}`).join("\n"));
        return appendFooter(container, `${LEGEND} · /help ${wanted} <subcommand> for details`);
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
    const paths = [...new Set([...entries.map((entry) => entry.parent), ...entries.map((entry) => entry.path)])].sort();
    return paths
        .filter((candidate) => candidate.includes(query))
        .slice(0, 25)
        .map((candidate) => ({ name: `/${candidate}`, value: candidate }));
}

module.exports = { buildHelp, buildHelpDetail, helpChoices, listEntries, usageOf };
