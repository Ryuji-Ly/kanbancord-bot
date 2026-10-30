const { resolveBoard } = require("../boards/boardData");
const { infoContainer, successContainer } = require("../../ui/containers");
const { describeReminderTimes, parseReminderTimes } = require("../../utils/reminderTimes");

/**
 * Reminder times before a due date: the server's (`/kanbancord reminders`), a board's own (`/board reminders`) and
 * the user's own, everywhere or for one board (`/notifications reminders:`). The API decides who may change which.
 */

const OVERDUE = "Everyone on a task is also reminded once it is overdue.";

/** /kanbancord reminders: shows the server's times, or sets them ("default" is a day before). */
async function serverReminders(ctx, input) {
    if (input) {
        const minutes = parseReminderTimes(input) ?? [1440];
        const saved = await ctx.api.put("/reminders", { body: { minutes } });
        return successContainer("Reminder times saved", `People are reminded **${describeReminderTimes(saved.minutes)}** `
            + `on every board without times of its own. ${OVERDUE}`);
    }
    const current = await ctx.api.get("/reminders");
    return infoContainer("Reminder times", `People are reminded **${describeReminderTimes(current.minutes)}**. `
        + `${OVERDUE}\n\nChange it with \`/kanbancord reminders times:1d, 3h\`. A board can have its own times with `
        + "`/board reminders`, and each person can choose their own with `/notifications reminders:`.");
}

/** /board reminders: shows the board's times, or sets them ("default" goes back to the server's). */
async function boardReminders(ctx, boardInput, input) {
    const board = await resolveBoard(ctx, boardInput);
    const path = `/boards/${board.boardId}/reminders`;
    const result = input
        ? await ctx.api.put(path, { body: { minutes: parseReminderTimes(input) } })
        : await ctx.api.get(path);
    const whose = result.minutes ? "its own times" : "the server's times";
    const text = `On **${board.name}**, people are reminded **${describeReminderTimes(result.effective)}** (${whose}). `
        + `${OVERDUE}`;
    return input
        ? successContainer("Reminder times saved", text)
        : infoContainer("Reminder times", `${text}\n\nChange it with \`/board reminders times:1d, 3h\`, or \`default\` `
            + "for the server's times.");
}

/** /notifications reminders: the user's own times, for one board or everywhere ("default" removes them). */
async function myReminders(ctx, input, boardInput) {
    const minutes = parseReminderTimes(input);
    if (boardInput) {
        const board = await resolveBoard(ctx, boardInput);
        const result = await ctx.api.put(`/boards/${board.boardId}/reminders/mine`, { body: { minutes } });
        return successContainer("Your reminder times saved", minutes === null
            ? `On **${board.name}** you are reminded like everyone else again: **${describeReminderTimes(result.effective)}**.`
            : `On **${board.name}** you are reminded **${describeReminderTimes(result.effective)}**, whatever the `
                + "board's times are. Only your own direct messages change.");
    }
    const result = await ctx.api.myReminders.update({ minutes });
    return successContainer("Your reminder times saved", result.everywhere === null
        ? "You are reminded at each board's times again, except on boards where you chose your own."
        : `On every board you are reminded **${describeReminderTimes(result.everywhere)}**, except on boards where `
            + "you chose times for that board. Only your own direct messages change.");
}

module.exports = { serverReminders, boardReminders, myReminders };
