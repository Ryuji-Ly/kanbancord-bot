/**
 * Options shared by many commands, so they are named and described the same way everywhere.
 * Autocomplete for all of them is answered by services/boards/autocomplete.js.
 */

const boardOption = (description = "The board") => (option) =>
    option.setName("board").setDescription(description).setRequired(true).setAutocomplete(true);

const taskOption = (option) =>
    option.setName("task").setDescription("The task").setRequired(true).setAutocomplete(true);

const columnOption = (description = "The column", required = true) => (option) =>
    option.setName("column").setDescription(description).setRequired(required).setAutocomplete(true);

/** Adds the board and task options every task subcommand starts with. */
function withBoardAndTask(sub) {
    return sub.addStringOption(boardOption("The board the task is on")).addStringOption(taskOption);
}

module.exports = { boardOption, taskOption, columnOption, withBoardAndTask };
