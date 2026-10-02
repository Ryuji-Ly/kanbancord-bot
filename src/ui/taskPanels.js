const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    LabelBuilder,
    ModalBuilder,
    RoleSelectMenuBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
    UserSelectMenuBuilder,
} = require("discord.js");
const { encode } = require("../utils/customId");
const { EXAMPLES, toInputText } = require("../utils/dueDate");
const { parseServerTime, plain, truncate } = require("../utils/format");
const { appendText, buildContainer, warningContainer } = require("./containers");
const { colorChoices, nextColor } = require("../utils/colors");

/**
 * What can be done to a task from Discord: the actions menu on the task view, the small panels it
 * opens (a column to move to, people to assign...), and the forms for text. Every control carries
 * the board and task, and each change is made as whoever uses it.
 */

/** Discord shows at most 25 options in a menu, and text in a form of at most 4000 characters. */
const MENU_MAX = 25;
const FORM_TEXT_MAX = 4000;
const DESCRIPTION_MAX = 4000;

function backButton(boardId, taskId) {
    return new ButtonBuilder()
        .setCustomId(encode("task", "show", boardId, taskId))
        .setStyle(ButtonStyle.Secondary)
        .setLabel("Back to task");
}

/**
 * The actions this user may take on the task, as menu options. Assigning oneself is a direct action
 * for those who may not assign others.
 */
function taskActions(model, task, abilities, userId) {
    const actions = [];
    if (abilities.editTask) {
        actions.push({ value: "edit", label: "Edit title and description" });
    }
    if (abilities.moveTask && model.columns.length > 1) {
        actions.push({ value: "move", label: "Move to another column" });
    }
    if (abilities.assignSelf && userId) {
        const assigned = model.assigneesOf(task).includes(String(userId));
        actions.push({ value: assigned ? "unassignme" : "assignme", label: assigned ? "Unassign me" : "Assign me" });
    }
    if (abilities.assignOthers) {
        actions.push({ value: "people", label: "Assign people" });
        actions.push({ value: "roles", label: "Assign roles" });
    }
    if ((abilities.applyLabel || abilities.removeLabel) && model.features.LABELS) {
        actions.push({ value: "labels", label: "Labels" });
    }
    if (abilities.setPriority) {
        actions.push({ value: "priority", label: "Priority" });
    }
    if (abilities.setDue) {
        actions.push({ value: "due", label: "Due date" });
    }
    if (abilities.comment) {
        actions.push({ value: "comment", label: "Add a comment" });
    }
    // Anyone who can see the task may follow it; only the person the view is for can be asked.
    if (userId) {
        actions.push(model.isFollowing(task)
            ? { value: "unfollow", label: "Unfollow" }
            : { value: "follow", label: "Follow: hear about changes by direct message" });
    }
    if (abilities.deleteTask) {
        actions.push({ value: "delete", label: "Delete task" });
    }
    return actions;
}

/** The actions menu for the task view, or null when the user can do nothing to the task. */
function actionsRow(model, task, abilities, userId) {
    const actions = taskActions(model, task, abilities, userId);
    if (actions.length === 0) {
        return null;
    }
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(encode("act", "menu", model.board.boardId, task.taskId))
            .setPlaceholder("Change this task…")
            .addOptions(actions),
    );
}

/** A panel: the control (left out when there is nothing to choose from), then Back and any extra buttons. */
function panel(model, task, title, control, note, extra = []) {
    const container = buildContainer({ title, body: `-# ${plain(task.title, 150)}` });
    if (note) {
        appendText(container, note);
    }
    if (control) {
        container.addActionRowComponents(new ActionRowBuilder().addComponents(control));
    }
    container.addActionRowComponents(new ActionRowBuilder().addComponents(...extra, backButton(model.board.boardId, task.taskId)));
    return container;
}

function newButton(label, action, model, task) {
    return new ButtonBuilder()
        .setCustomId(encode("act", action, model.board.boardId, task.taskId))
        .setStyle(ButtonStyle.Primary)
        .setLabel(label);
}

function movePanel(model, task) {
    const columns = model.columns.filter((column) => column.columnId !== task.columnId).slice(0, MENU_MAX);
    return panel(model, task, "Move to", new StringSelectMenuBuilder()
        .setCustomId(encode("act", "move", model.board.boardId, task.taskId))
        .setPlaceholder("Pick a column…")
        .addOptions(columns.map((column) => ({
            label: truncate(column.name, 100),
            description: `${model.tasksIn(column.columnId).length} tasks`,
            value: String(column.columnId),
        }))));
}

function peoplePanel(model, task) {
    const current = model.assigneesOf(task).slice(0, MENU_MAX);
    const select = new UserSelectMenuBuilder()
        .setCustomId(encode("act", "people", model.board.boardId, task.taskId))
        .setPlaceholder("Nobody assigned")
        .setMinValues(0)
        .setMaxValues(MENU_MAX);
    if (current.length > 0) {
        select.setDefaultUsers(current);
    }
    return panel(model, task, "Assigned people", select, "Pick everyone who should be assigned; remove someone to unassign them.");
}

function rolesPanel(model, task) {
    const current = model.rolesOf(task).slice(0, MENU_MAX);
    const select = new RoleSelectMenuBuilder()
        .setCustomId(encode("act", "roles", model.board.boardId, task.taskId))
        .setPlaceholder("No roles assigned")
        .setMinValues(0)
        .setMaxValues(MENU_MAX);
    if (current.length > 0) {
        select.setDefaultRoles(current);
    }
    return panel(model, task, "Assigned roles", select,
        "Assigning a role shows who the task is for; it does not give the role anything.");
}

function labelsPanel(model, task) {
    const applied = new Set(model.labelsOf(task).map((label) => label.labelId));
    const labels = model.labels().slice(0, MENU_MAX);
    const note = labels.length === 0
        ? "This board has no labels yet. Make the first one: it is added to this task."
        : model.labels().length > MENU_MAX ? `Only the first ${MENU_MAX} labels fit here; use the website for the rest.` : null;
    const select = labels.length === 0 ? null : new StringSelectMenuBuilder()
        .setCustomId(encode("act", "labels", model.board.boardId, task.taskId))
        .setPlaceholder("No labels")
        .setMinValues(0)
        .setMaxValues(labels.length)
        .addOptions(labels.map((label) => ({
            label: truncate(label.name, 100),
            value: String(label.labelId),
            default: applied.has(label.labelId),
        })));
    return panel(model, task, "Labels", select, note, [newButton("New label", "newlabel", model, task)]);
}

function priorityPanel(model, task) {
    const levels = model.priorities().slice(0, MENU_MAX - 1);
    const extra = [newButton("New priority", "newprio", model, task)];
    if (levels.length === 0) {
        return panel(model, task, "Priority", null, "This board has no priority levels. Make one: it is set on this task.", extra);
    }
    return panel(model, task, "Priority", new StringSelectMenuBuilder()
        .setCustomId(encode("act", "priority", model.board.boardId, task.taskId))
        .setPlaceholder("Pick a priority…")
        .addOptions([
            ...levels.map((level) => ({
                label: truncate(level.name, 100),
                value: String(level.priorityId),
                default: level.priorityId === task.priorityId,
            })),
            { label: "No priority", value: "none", default: task.priorityId === null || task.priorityId === undefined },
        ]), null, extra);
}

/** A new label for the board, put on the task when it is made. */
function newLabelModal(model, task) {
    const suggested = nextColor(model.labels().map((label) => label.color));
    return new ModalBuilder()
        .setCustomId(encode("act", "newlabel", model.board.boardId, task.taskId))
        .setTitle("New label")
        .addLabelComponents(
            new LabelBuilder().setLabel("Name").setTextInputComponent(textInput("name", { max: 50 })),
            new LabelBuilder().setLabel("Colour").setStringSelectMenuComponent(new StringSelectMenuBuilder()
                .setCustomId("color")
                .setRequired(false)
                .addOptions(colorChoices("").slice(0, 25).map((choice) => ({
                    label: choice.name,
                    value: choice.value,
                    default: choice.value.toLowerCase() === String(suggested).toLowerCase(),
                })))),
        );
}

/** A new priority level, set on the task when it is made; where it goes among the others. */
function newPriorityModal(model, task) {
    const levels = model.priorities().slice(0, MENU_MAX - 1);
    const fields = [new LabelBuilder().setLabel("Name").setTextInputComponent(textInput("name", { max: 50 }))];
    if (levels.length > 0) {
        fields.push(new LabelBuilder().setLabel("Where it goes").setStringSelectMenuComponent(new StringSelectMenuBuilder()
            .setCustomId("position")
            .setRequired(false)
            .addOptions(
                { label: "Most urgent: above all the others", value: "1" },
                ...levels.map((level, index) => ({
                    label: truncate(`Below ${level.name}`, 100),
                    value: String(index + 2),
                    default: index === levels.length - 1,
                })),
            )));
    }
    return new ModalBuilder()
        .setCustomId(encode("act", "newprio", model.board.boardId, task.taskId))
        .setTitle("New priority level")
        .addLabelComponents(...fields);
}

function deletePanel(model, task) {
    const container = warningContainer("Delete this task?", `**${plain(task.title, 150)}** and its comments will be deleted for everyone. This cannot be undone.`);
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(encode("act", "delete", model.board.boardId, task.taskId))
            .setStyle(ButtonStyle.Danger)
            .setLabel("Delete task"),
        backButton(model.board.boardId, task.taskId).setLabel("Cancel"),
    ));
    return container;
}

// ── Forms ────────────────────────────────────────────────────────────────────

function textInput(id, { style = TextInputStyle.Short, max, value, required = true, placeholder } = {}) {
    const input = new TextInputBuilder().setCustomId(id).setStyle(style).setRequired(required);
    if (max) {
        input.setMaxLength(max);
    }
    if (value) {
        input.setValue(String(value).slice(0, max ?? FORM_TEXT_MAX));
    }
    if (placeholder) {
        input.setPlaceholder(placeholder);
    }
    return input;
}

/**
 * Title and description. A description longer than a form can hold is left out, so saving the form
 * can never cut it short; it can still be edited on the website.
 */
/** @param {string} [feature] whose handler receives the form: the task view's, or a feed post's */
function editTaskModal(boardId, task, feature = "act") {
    const modal = new ModalBuilder()
        .setCustomId(encode(feature, "edit", boardId, task.taskId))
        .setTitle("Edit task")
        .addLabelComponents(new LabelBuilder().setLabel("Title").setTextInputComponent(textInput("title", { max: 200, value: task.title })));
    if ((task.description ?? "").length <= DESCRIPTION_MAX) {
        modal.addLabelComponents(new LabelBuilder()
            .setLabel("Description")
            .setDescription("Markdown works, like on the website.")
            .setTextInputComponent(textInput("description", {
                style: TextInputStyle.Paragraph,
                max: DESCRIPTION_MAX,
                value: task.description,
                required: false,
            })));
    }
    return modal;
}

function dueModal(boardId, task) {
    return new ModalBuilder()
        .setCustomId(encode("act", "due", boardId, task.taskId))
        .setTitle("Due date")
        .addLabelComponents(new LabelBuilder()
            .setLabel("When (UTC)")
            .setDescription("A date alone is due at the end of that day. Leave empty to remove the due date.")
            .setTextInputComponent(textInput("due", {
                max: 40,
                required: false,
                value: toInputText(parseServerTime(task.dueDate)),
                placeholder: EXAMPLES,
            })));
}

/** @param {boolean} [fromComments] opened from the comments, which then show the new comment */
function commentModal(boardId, taskId, fromComments = false) {
    return new ModalBuilder()
        .setCustomId(fromComments ? encode("comment", "post", boardId, taskId) : encode("act", "comment", boardId, taskId))
        .setTitle("Add a comment")
        .addLabelComponents(new LabelBuilder()
            .setLabel("Comment")
            .setTextInputComponent(textInput("content", { style: TextInputStyle.Paragraph, max: 2000 })));
}

module.exports = {
    taskActions,
    actionsRow,
    movePanel,
    peoplePanel,
    rolesPanel,
    labelsPanel,
    priorityPanel,
    deletePanel,
    editTaskModal,
    dueModal,
    commentModal,
    newLabelModal,
    newPriorityModal,
};
