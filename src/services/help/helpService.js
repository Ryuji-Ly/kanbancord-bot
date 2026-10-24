const { ActionRowBuilder, ApplicationCommandOptionType, ApplicationCommandType, ButtonBuilder, ButtonStyle } = require("discord.js");
const { webAppUrl, supportServerUrl } = require("../../config/env");
const { buildContainer, appendDivider, appendText, appendFooter } = require("../../ui/containers");
const { encode } = require("../../utils/customId");
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
        // Commands found on a message's menu are listed on their own (see menuCommands).
        if (json.type !== undefined && json.type !== ApplicationCommandType.ChatInput) {
            continue;
        }
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

/** Commands on a message's menu: long-press or right-click a message, then Apps. */
function menuCommands(commands) {
    return [...commands.values()]
        .filter((command) => command.data.toJSON().type === ApplicationCommandType.Message)
        .map((command) => `**${command.data.name}**: long-press or right-click a message, then Apps → ${command.data.name}. `
            + (command.info?.summary ?? command.info?.description ?? ""));
}

/** How many optional options the overview lists before it says `[options]` instead. */
const SHORT_OPTIONAL = 3;

/**
 * `/board view <board>`: options in order, required ones in <>, optional ones in []. With `short`,
 * for the overview, a long list of optional ones is just `[options]`; /help on the command has them all.
 */
function usageOf(entry, { short = false } = {}) {
    const all = entry.json.options ?? [];
    const optional = all.filter((option) => !option.required);
    const collapse = short && optional.length > SHORT_OPTIONAL;
    const options = all
        .filter((option) => option.required || !collapse)
        .map((option) => (option.required ? `<${option.name}>` : `[${option.name}]`));
    return [`/${entry.path}`, ...options, ...(collapse ? ["[options]"] : [])].join(" ");
}

/** About how much command text one page of the overview shows, so a page reads at a glance. */
const PAGE_TEXT = 1600;

/**
 * The overview's pages: each command's lines kept together, a page filled until it reaches
 * {@link PAGE_TEXT}. A command with subcommands cannot be run on its own, so only its subcommands
 * are listed, grouped by the command they belong to.
 */
function helpPages(commands) {
    const entries = listEntries(commands);
    const parents = [...new Set(entries.map((entry) => entry.parent))];
    const blocks = parents.map((parent) =>
        entries
            .filter((entry) => entry.parent === parent)
            .map((entry) => `\`${usageOf(entry, { short: true })}\` — ${entry.json.description}`)
            .join("\n"));
    const pages = [];
    for (const block of blocks) {
        const last = pages[pages.length - 1];
        if (last && last.reduce((total, text) => total + text.length, 0) + block.length <= PAGE_TEXT) {
            last.push(block);
        } else {
            pages.push([block]);
        }
    }
    return pages.map((page) => page.join("\n\n"));
}

/**
 * The overview, one page at a time: the introduction on the first page, the commands on a
 * message's menu on the last, and buttons to turn the pages.
 */
function buildHelp(commands, page = 0) {
    const pages = helpPages(commands);
    const current = Math.min(Math.max(0, Number(page) || 0), pages.length - 1);
    const container = current === 0
        ? buildContainer({
            title: "KanbanCord",
            body: "Kanban boards for your Discord server: use them here with these commands, in a call with the "
                + "**KanbanCord Activity** (from the Activities button or the app launcher), or on the website.",
        })
        : buildContainer({ title: "KanbanCord commands" });
    appendDivider(container);
    appendText(container, pages[current]);
    const menus = menuCommands(commands);
    if (current === pages.length - 1 && menus.length > 0) {
        appendDivider(container);
        appendText(container, menus.join("\n"));
    }

    const buttons = [];
    if (pages.length > 1) {
        buttons.push(
            new ButtonBuilder().setCustomId(encode("help", "page", current - 1)).setStyle(ButtonStyle.Secondary)
                .setLabel("Previous").setDisabled(current === 0),
            new ButtonBuilder().setCustomId(encode("help", "page", current + 1)).setStyle(ButtonStyle.Secondary)
                .setLabel("Next").setDisabled(current >= pages.length - 1),
        );
    }
    buttons.push(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Open KanbanCord").setURL(webAppUrl),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Support server").setURL(supportServerUrl),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("What's new").setURL(`${webAppUrl}/updates`),
    );
    container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons));
    const pageNote = pages.length > 1 ? `Page ${current + 1} of ${pages.length} · ` : "";
    return appendFooter(container, `${pageNote}${LEGEND} · /help <command> for details · Found a problem? Use /report or ask in the support server.`);
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

module.exports = { buildHelp, buildHelpDetail, helpChoices, helpPages, listEntries, usageOf };
