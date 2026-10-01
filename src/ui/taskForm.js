const {
    LabelBuilder,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
    UserSelectMenuBuilder,
} = require("discord.js");
const { EXAMPLES } = require("../utils/dueDate");
const { truncate } = require("../utils/format");

/**
 * The new-task form. Besides the title and description it asks for whatever the board has switched
 * on (people, a due date, a priority, labels), as far as Discord's five fields go; the rest can be
 * set on the task afterwards. Every extra field is optional.
 */

/** Discord shows at most five fields in a form, and 25 options in a menu. */
const FORM_FIELDS_MAX = 5;
const MENU_MAX = 25;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 4000;
/** People who can be assigned from the form; more can be added on the task. */
const PEOPLE_MAX = 10;

/** The fields a board's switched-on features add, most useful first. */
function extraFields(model) {
    const { features } = model;
    const fields = [];
    if (features.ASSIGNEES) {
        fields.push(new LabelBuilder()
            .setLabel("Assign people")
            .setUserSelectMenuComponent(new UserSelectMenuBuilder()
                .setCustomId("people").setRequired(false).setMinValues(0).setMaxValues(PEOPLE_MAX)));
    }
    if (features.DUE_DATES) {
        fields.push(new LabelBuilder()
            .setLabel("Due (UTC)")
            .setDescription(`For example ${EXAMPLES.replace(", or none", "")}.`)
            .setTextInputComponent(new TextInputBuilder()
                .setCustomId("due").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(40)));
    }
    const levels = features.PRIORITIES ? model.priorities().slice(0, MENU_MAX) : [];
    if (levels.length > 0) {
        fields.push(new LabelBuilder()
            .setLabel("Priority")
            .setStringSelectMenuComponent(new StringSelectMenuBuilder()
                .setCustomId("priority").setRequired(false)
                .addOptions(levels.map((level) => ({ label: truncate(level.name, 100), value: String(level.priorityId) })))));
    }
    const labels = features.LABELS ? model.labels().slice(0, MENU_MAX) : [];
    if (labels.length > 0) {
        fields.push(new LabelBuilder()
            .setLabel("Labels")
            .setStringSelectMenuComponent(new StringSelectMenuBuilder()
                .setCustomId("labels").setRequired(false).setMinValues(0).setMaxValues(labels.length)
                .addOptions(labels.map((label) => ({ label: truncate(label.name, 100), value: String(label.labelId) })))));
    }
    return fields;
}

/**
 * @param {{ customId: string, model: object, chooseColumn?: boolean, prefill?: { title?: string, description?: string } }} options
 *   `chooseColumn` asks which column (for a board post); otherwise the column is part of the custom id.
 *   `prefill` starts the title and description off (a task made from a message).
 */
function newTaskModal({ customId, model, chooseColumn = false, prefill = {} }) {
    const title = new TextInputBuilder()
        .setCustomId("title").setStyle(TextInputStyle.Short).setMaxLength(TITLE_MAX).setRequired(true);
    const description = new TextInputBuilder()
        .setCustomId("description").setStyle(TextInputStyle.Paragraph).setMaxLength(DESCRIPTION_MAX).setRequired(false);
    if (prefill.title) {
        title.setValue(prefill.title.slice(0, TITLE_MAX));
    }
    if (prefill.description) {
        description.setValue(prefill.description.slice(0, DESCRIPTION_MAX));
    }
    const fields = [
        new LabelBuilder().setLabel("Title").setTextInputComponent(title),
        new LabelBuilder().setLabel("Description").setTextInputComponent(description),
    ];
    if (chooseColumn) {
        fields.push(new LabelBuilder().setLabel("Column").setStringSelectMenuComponent(new StringSelectMenuBuilder()
            .setCustomId("column")
            .setRequired(true)
            .addOptions(model.columns.slice(0, MENU_MAX).map((column, index) => ({
                label: truncate(column.name, 100),
                value: String(column.columnId),
                default: index === 0,
            })))));
    }
    fields.push(...extraFields(model).slice(0, FORM_FIELDS_MAX - fields.length));
    return new ModalBuilder()
        .setCustomId(customId)
        .setTitle(truncate(`New task · ${model.board.name}`, 45))
        .addLabelComponents(...fields);
}

/** A field's value, or undefined when the form did not have it (the board has it switched off). */
function optional(read) {
    try {
        return read();
    } catch {
        return undefined;
    }
}

/**
 * What was filled in. `due` is the text as typed, read later so a date that cannot be understood
 * does not lose the rest of the form.
 *
 * @returns {{ title: string, description?: string, columnId?: string, people?: string[], due?: string,
 *   priorityId?: string, labelIds?: string[] }}
 */
function readNewTask(fields) {
    const people = optional(() => fields.getSelectedUsers("people"));
    const priority = optional(() => fields.getStringSelectValues("priority"));
    return {
        title: fields.getTextInputValue("title"),
        description: optional(() => fields.getTextInputValue("description")),
        columnId: optional(() => fields.getStringSelectValues("column"))?.[0],
        people: people ? [...people.keys()] : undefined,
        due: optional(() => fields.getTextInputValue("due")) || undefined,
        priorityId: priority?.[0],
        labelIds: optional(() => fields.getStringSelectValues("labels")),
    };
}

module.exports = { newTaskModal, readNewTask, FORM_FIELDS_MAX };
