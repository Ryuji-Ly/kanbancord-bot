const { UserFacingError } = require("./errorMessages");

/**
 * Due dates typed in Discord, which has no date picker. Times are UTC unless an offset is given;
 * replies show the result as a Discord timestamp, in each reader's own time zone, so it can be
 * checked at a glance.
 *
 * Accepted: "2026-10-01", "2026-10-01 17:00", "2026-10-01 17:00 +02:00", "today", "tomorrow",
 * "in 3 days", "in 2 weeks", "in 5 hours", and "none" (or "clear") to remove the due date.
 */

const EXAMPLES = "2026-10-01 17:00, tomorrow, in 3 days, or none";
/** A date on its own is due at the end of that day. */
const END_OF_DAY = { hours: 23, minutes: 59 };
const UNIT_MS = { hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000 };

function invalid(input) {
    return new UserFacingError("Could not read that date", `"${input}" is not a date I understand. Try ${EXAMPLES}.`);
}

function endOfDay(date) {
    const result = new Date(date);
    result.setUTCHours(END_OF_DAY.hours, END_OF_DAY.minutes, 0, 0);
    return result;
}

/**
 * @param {string} input
 * @param {Date} [now]
 * @returns {Date | null} null removes the due date
 */
function parseDue(input, now = new Date()) {
    const text = String(input ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!text || text === "none" || text === "clear" || text === "remove") {
        return null;
    }
    if (text === "today") {
        return endOfDay(now);
    }
    if (text === "tomorrow") {
        return endOfDay(new Date(now.getTime() + UNIT_MS.day));
    }
    const relative = text.match(/^in (\d{1,4}) (hour|day|week)s?$/);
    if (relative) {
        const amount = Number(relative[1]) * UNIT_MS[relative[2]];
        const date = new Date(now.getTime() + amount);
        return relative[2] === "hour" ? roundToMinute(date) : endOfDay(date);
    }
    const absolute = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ t](\d{1,2}):(\d{2}))?(?: ?(z|utc|[+-]\d{2}:?\d{2}))?$/);
    if (!absolute) {
        throw invalid(input);
    }
    const [, year, month, day, hours, minutes, zone] = absolute;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day),
        hours === undefined ? END_OF_DAY.hours : Number(hours),
        minutes === undefined ? END_OF_DAY.minutes : Number(minutes)));
    // Date.UTC rolls over impossible dates (Feb 30 becomes March 2); refuse them instead.
    if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1
        || date.getUTCDate() !== Number(day) || Number(hours ?? 0) > 23) {
        throw invalid(input);
    }
    if (zone && zone !== "z" && zone !== "utc") {
        const [, sign, offsetHours, offsetMinutes] = zone.match(/^([+-])(\d{2}):?(\d{2})$/);
        const offset = (Number(offsetHours) * 60 + Number(offsetMinutes)) * 60_000;
        return new Date(date.getTime() - (sign === "+" ? offset : -offset));
    }
    return date;
}

function roundToMinute(date) {
    return new Date(Math.round(date.getTime() / 60_000) * 60_000);
}

/** How the API wants it: a UTC date and time without a zone. */
function toServerTime(date) {
    return date ? date.toISOString().slice(0, 19) : null;
}

/** For pre-filling a form: "2026-10-01 17:00". */
function toInputText(date) {
    return date ? date.toISOString().slice(0, 16).replace("T", " ") : "";
}

module.exports = { EXAMPLES, parseDue, toServerTime, toInputText };
