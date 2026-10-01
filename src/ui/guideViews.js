const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const { supportServerUrl, webAppUrl } = require("../config/env");
const { encode } = require("../utils/customId");
const { linkButton } = require("./boardViews");
const { appendDivider, appendFooter, appendText, buildContainer } = require("./containers");

/**
 * /guide: setting KanbanCord up and using it day to day, entirely from Discord, one step at a time.
 * Steps this server has already done are ticked off, and the text follows the features it has on.
 */

/**
 * What the server has done so far, as far as the user can see. Anything that could not be found out
 * is undefined, and its step is simply not ticked.
 *
 * @typedef {{ features?: Record<string, boolean>, boards?: number, columns?: boolean, tasks?: boolean,
 *   taskDetails?: boolean, updates?: boolean, notifications?: boolean }} GuideState
 */

const on = (state, key) => Boolean(state.features?.[key]);

/** A feature's commands, or a note that it is off and how to turn it on. */
function ifOn(state, key, text, name) {
    if (!state.features || on(state, key)) {
        return text;
    }
    return `${text}\n-# ${name} are switched off here; a server manager can turn them on with \`/kanbancord features\`.`;
}

/** The extra fields /task create's form asks for, following the server's features. */
function formFields(state) {
    const fields = [
        on(state, "ASSIGNEES") && "people",
        on(state, "DUE_DATES") && "a due date",
        on(state, "PRIORITIES") && "a priority",
        on(state, "LABELS") && "labels",
    ].filter(Boolean).slice(0, 3);
    return fields.length === 0 ? "" : `, and ${fields.join(", ").replace(/, ([^,]*)$/, " and $1")}`;
}

const STEPS = [
    {
        key: "start",
        title: "How KanbanCord works",
        summary: "Boards, columns and tasks, all from Discord",
        done: (state) => state.boards > 0,
        body: () => [
            "KanbanCord puts kanban boards in your server. A **board** has **columns** (To Do, In Progress, Done...), "
                + "and **tasks** move from column to column as work gets done.",
            "Everything in this guide happens in Discord with slash commands and the buttons on their replies. "
                + "Replies are visible to the channel, so everyone sees what changed; `/help`, `/guide`, `/notifications` "
                + "and `/kanbancord` answer only you.",
            `The website (${webAppUrl.replace(/^https?:\/\//, "")}) is optional: it shows whole boards at a glance and `
                + "holds the fine-tuning, like detailed permissions.",
        ],
    },
    {
        key: "features",
        title: "Simple mode and features",
        summary: "Choose what your tasks can have",
        done: (state) => state.features && Object.values(state.features).some(Boolean),
        body: (state) => [
            "New servers start in **simple mode**: boards, columns, and tasks with a title and a description. Nothing "
                + "else to learn.",
            "When your server needs more, a server manager can switch on **assignees**, **due dates** (with "
                + "reminders), **priorities**, **labels**, **comments** and **custom permissions** with "
                + "`/kanbancord features`. Switching one off again hides it without deleting anything.",
            "What people may do follows their Discord roles. For a small group that trusts each other, **open "
                + "permissions** (also in `/kanbancord features`) let everyone who can talk here do anything with boards "
                + "and tasks.",
            state.features
                ? `Right now: ${Object.entries(state.features).filter(([, value]) => value).map(([key]) => `**${key.toLowerCase().replace("_", " ")}**`).join(", ") || "simple mode"}.`
                : null,
        ],
    },
    {
        key: "board",
        title: "Create a board",
        summary: "`/board create`",
        done: (state) => state.boards > 0,
        body: () => [
            "`/board create name:Sprint` makes a board with three columns: **To Do**, **In Progress** and **Done**.",
            "`/board view` shows it, with a menu to open a column and then a task. `/board list` lists every board "
                + "you can see, `/board edit` renames it, and `/board archive` puts a finished board away (read-only, "
                + "`/board restore` brings it back).",
            "Who can see and change a board follows your server's Discord roles from the start.",
        ],
    },
    {
        key: "columns",
        title: "Shape the columns",
        summary: "`/column add`, `rename`, `move`, `delete`",
        done: (state) => Boolean(state.columns),
        body: () => [
            "Make the columns match how your team works:",
            "- `/column add board:Sprint name:Review` adds one at the end\n"
                + "- `/column rename` renames one\n"
                + "- `/column move column:Review position:3` moves it (1 is the leftmost)\n"
                + "- `/column delete` deletes one and its tasks, after asking",
            "Or open a column from `/board view`: it has a menu to move it and buttons to add a task, rename or delete it. "
                + "`/board view` itself has **Add column**.",
            "The last column counts as **done**: tasks there get no due-date reminders.",
        ],
    },
    {
        key: "tasks",
        title: "Add and move tasks",
        summary: "`/task create`, `/task move`",
        done: (state) => Boolean(state.tasks),
        body: (state) => [
            `\`/task create board:Sprint\` opens a form for the title and description${formFields(state)}. `
                + "Add `column:` to start it somewhere other than the first column.",
            "`/task move task:... column:Done` moves it along. `/task view` shows a task in full, with a menu for "
                + "everything you may change: edit, move, assign, delete and more.",
            "You rarely need to type these: `/board view` and each column have **Add task**, and every view links to the "
                + "next, from the board list down to a task's comments. Anyone can use the buttons; whether they may make the "
                + "change is checked when they click.",
            "Something said in chat belongs on the board? Long-press or right-click the message, then **Apps → Create "
                + "task**: the message fills in the form, with a link back to it.",
        ],
    },
    {
        key: "details",
        title: "People, due dates, priorities and labels",
        summary: "`/task assign`, `due`, `priority`, `label`",
        done: (state) => Boolean(state.taskDetails),
        body: (state) => [
            ifOn(state, "ASSIGNEES", "**People**: `/task assign` assigns you, someone, or a whole role; "
                + "`/task unassign` takes them off. Assigned people hear about their tasks.", "Assignees"),
            ifOn(state, "DUE_DATES", "**Due dates**: `/task due when:tomorrow` (or `in 3 days`, `2026-10-01 17:00`, "
                + "`none`). People are reminded a day before and when it is overdue.", "Due dates"),
            ifOn(state, "PRIORITIES", "**Priorities**: boards start with Critical, High, Medium, Low and Ignorable. "
                + "`/task priority` sets one; `/priority create`, `edit`, `move` and `delete` change the levels.",
            "Priorities"),
            ifOn(state, "LABELS", "**Labels**: `/label create name:Bug color:Red` makes one, `/task label` puts it on "
                + "a task or takes it off.", "Labels"),
            ifOn(state, "COMMENTS", "**Comments**: `/comment add` and `/comment list` discuss a task.", "Comments"),
        ],
    },
    {
        key: "updates",
        title: "Keep everyone up to date",
        summary: "A board post, or a feed",
        done: (state) => Boolean(state.updates),
        body: () => [
            "Two ways to show your team what is going on. Most servers use one of them:",
            "**A board post** (`/board post`) is one message showing the whole board, and it updates itself whenever "
                + "anything changes. Like a live dashboard: the place to look for *where things stand*. It pings "
                + "nobody, and anyone can open its columns and tasks, or add one, privately. Delete the message to stop it.",
            "**A feed** (`/kanbancord feed`, for server managers) posts a new message *for each change*, and mentions "
                + "the people it concerns, such as someone just assigned. Its posts can show the whole task with buttons "
                + "to move, assign or edit it right there. The place to follow *what just happened*.",
            "They also work together, say a board post in #board and a feed in #updates. For a record of every change "
                + "that pings nobody, `/kanbancord audit-channel` mirrors the audit log to a channel.",
            "**Setting up a feed**, in this order:\n"
                + "1. `/kanbancord feed channel:#updates` adds it (add `board:` for one board).\n"
                + "2. **Choose events and mentions** on the reply, or later `/kanbancord settings`, picks what it posts "
                + "and which posts mention the people involved.\n"
                + "3. `/board notifications` changes that for one board only.\n"
                + "4. `/board threads board:... enabled:True` gives each task its own thread in the feed's channel: "
                + "public, or private for the task's creator and assignees. **Discuss in thread** on a task opens "
                + "its thread right away.",
        ],
        link: { label: "Feeds and threads guide", path: "/guides/feeds-and-threads" },
    },
    {
        key: "you",
        title: "Your own notifications",
        summary: "`/notifications`, following tasks",
        done: (state) => Boolean(state.notifications),
        body: () => [
            "The bot can message you directly about tasks you are **assigned to**, **created** or **follow**. Follow "
                + "any task from its menu in `/task view`, or with **Follow** on a feed post.",
            "`/notifications` chooses when (always, only when a channel did not already mention you, or never), how "
                + "much from this server, and which events you hear about. Every direct message also has a button to "
                + "stop messages from its server. You are never told about your own changes.",
        ],
    },
    {
        key: "more",
        title: "That's it",
        summary: "Where to go from here",
        // Every other step done.
        done: (state) => STEPS.every((step) => step.key === "more" || step.done(state)),
        body: () => [
            "That covers everyday use. `/help` lists every command with examples, and `/help command:task create` "
                + "explains one in detail.",
            "On the website you can fine-tune who may do what per board and per person, set which features each board "
                + "uses, and browse the audit log of every change.",
            "Found a bug or have an idea? Use `/report`, or ask in the support server.",
        ],
    },
];

function navigation(index) {
    const rows = [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
        .setCustomId(encode("guide", "jump"))
        .setPlaceholder("Go to a step…")
        .addOptions(STEPS.map((step, stepIndex) => ({
            label: `${stepIndex + 1}. ${step.title}`,
            description: step.summary.replace(/`/g, ""),
            value: String(stepIndex),
            default: stepIndex === index,
        }))))];
    const buttons = [
        new ButtonBuilder().setCustomId(encode("guide", "page", "overview")).setStyle(ButtonStyle.Secondary).setLabel("Overview"),
        new ButtonBuilder().setCustomId(encode("guide", "page", Math.max(0, index - 1))).setStyle(ButtonStyle.Secondary)
            .setLabel("Back").setDisabled(index <= 0),
        new ButtonBuilder().setCustomId(encode("guide", "page", Math.min(STEPS.length - 1, index + 1))).setStyle(ButtonStyle.Primary)
            .setLabel("Next").setDisabled(index >= STEPS.length - 1),
    ];
    if (index === STEPS.length - 1) {
        buttons.push(linkButton("Support server", supportServerUrl));
    }
    rows.push(new ActionRowBuilder().addComponents(buttons));
    return rows;
}

/** The first page: every step, ticked off where this server has done it. */
function buildGuideOverview(state) {
    const container = buildContainer({
        title: "KanbanCord guide",
        body: "Set up and use KanbanCord without leaving Discord. Take the steps in order, or jump to one.",
    });
    appendDivider(container);
    appendText(container, STEPS.map((step, index) => {
        const mark = step.done?.(state) ? "✅" : "▫️";
        return `${mark} **${index + 1}. ${step.title}** · ${step.summary}`;
    }).join("\n"));
    container.addActionRowComponents(...navigation(-1).map((row, rowIndex) => (rowIndex === 1
        ? new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(encode("guide", "page", 0)).setStyle(ButtonStyle.Primary).setLabel("Start"))
        : row)));
    return appendFooter(container, "Only you can see this guide. Ticks show what this server has done so far.");
}

/** One step. */
function buildGuideStep(index, state) {
    const step = STEPS[index];
    const done = step.done?.(state) ? " ✅" : "";
    const container = buildContainer({ title: `${index + 1}. ${step.title}${done}` });
    appendText(container, step.body(state).filter(Boolean).join("\n\n"));
    if (step.link) {
        container.addActionRowComponents(new ActionRowBuilder().addComponents(
            linkButton(step.link.label, `${webAppUrl.replace(/\/$/, "")}${step.link.path}`)));
    }
    container.addActionRowComponents(...navigation(index));
    return appendFooter(container, `Step ${index + 1} of ${STEPS.length} · only you can see this guide`);
}

module.exports = { STEPS, buildGuideOverview, buildGuideStep };
