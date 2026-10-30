const { UserFacingError } = require("./errorMessages");

/**
 * Reminder times before a due date, as people type them ("1d, 3h", "2 days, 30 minutes") and as the bot shows
 * them ("1 day and 3 hours before"). The API keeps them in minutes.
 */

const UNITS = { w: 10080, d: 1440, h: 60, m: 1 };
const PART = /(\d+(?:[.,]\d+)?)\s*(weeks?|w|days?|d|hours?|hrs?|h|minutes?|mins?|m)\b/gi;

/**
 * @returns {number[]|null} minutes, latest first; [] for "none" (only the overdue reminder); null for "default"
 *   (back to what applies above: the server's for a board, the board's for a person)
 */
function parseReminderTimes(input) {
    const text = String(input ?? "").trim().toLowerCase();
    if (["none", "off", "no"].includes(text)) {
        return [];
    }
    if (["default", "reset", "clear"].includes(text)) {
        return null;
    }
    const minutes = new Set();
    for (const item of text.split(/,|;|\band\b/).map((part) => part.trim()).filter(Boolean)) {
        let total = 0;
        let rest = item;
        for (const [whole, amount, unit] of item.matchAll(PART)) {
            total += Number(amount.replace(",", ".")) * UNITS[unit[0]];
            rest = rest.replace(whole, "");
        }
        if (total === 0 || rest.trim() !== "") {
            throw new UserFacingError("Reminder times not understood",
                `Could not read **${item.slice(0, 40)}**. Write times before the due date like \`1d, 3h, 30m\` or `
                + "`2 days, 1 week`, `none` for no reminders before it, or `default` to go back to the usual times.");
        }
        minutes.add(Math.round(total));
    }
    if (minutes.size === 0) {
        throw new UserFacingError("No reminder times", "Write times before the due date like `1d, 3h`.");
    }
    return [...minutes].sort((a, b) => b - a);
}

/** 1440 → "1 day", 1500 → "1 day 1 hour", 30 → "30 minutes". */
function formatMinutes(minutes) {
    const parts = [];
    let rest = minutes;
    for (const [name, size] of [["week", 10080], ["day", 1440], ["hour", 60], ["minute", 1]]) {
        const count = Math.floor(rest / size);
        if (count > 0) {
            parts.push(`${count} ${name}${count === 1 ? "" : "s"}`);
            rest -= count * size;
        }
    }
    return parts.join(" ");
}

/** "1 day and 3 hours before the due date", or that there are none. */
function describeReminderTimes(minutes) {
    if (!minutes || minutes.length === 0) {
        return "no reminders before the due date";
    }
    const parts = minutes.map(formatMinutes);
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0];
    return `${list} before the due date`;
}

module.exports = { parseReminderTimes, formatMinutes, describeReminderTimes };
