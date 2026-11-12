const { UserFacingError } = require("./errorMessages");

/**
 * Due dates typed in Discord, which has no date picker. Times are in the person's time zone (saved by the website
 * from their device, or chosen with /notifications timezone:), UTC when it is not known, or the offset typed with
 * them. Replies show the result as a Discord timestamp, in each reader's own time zone, so it can be checked at a
 * glance.
 *
 * Accepted: "2026-10-01", "2026-10-01 17:00", "2026-10-01 17:00 +02:00", "today", "tomorrow",
 * "in 3 days", "in 2 weeks", "in 5 hours", and "none" (or "clear") to remove the due date.
 *
 * A time zone is a place's name ("Europe/Berlin"), a fixed offset ("+08:00"), or "UTC", as the API stores it.
 */

const EXAMPLES = "2026-10-01 17:00, tomorrow, in 3 days, or none";
/** A date on its own is due at the end of that day. */
const END_OF_DAY = { hours: 23, minutes: 59 };
const UNIT_MS = { hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000 };
const FIXED_OFFSET = /^([+-])(\d{2}):(\d{2})$/;

function invalid(input) {
    return new UserFacingError("Could not read that date", `"${input}" is not a date I understand. Try ${EXAMPLES}.`);
}

/** Whether times can be read in this zone here; an unknown one is treated as UTC rather than failing. */
function isKnownZone(zone) {
    if (!zone || zone === "UTC" || FIXED_OFFSET.test(zone)) {
        return true;
    }
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: zone });
        return true;
    } catch {
        return false;
    }
}

/** How far the zone's clocks are ahead of UTC at that moment, in milliseconds (summer time included). */
function offsetAt(zone, instantMs) {
    if (!zone || zone === "UTC" || !isKnownZone(zone)) {
        return 0;
    }
    const fixed = zone.match(FIXED_OFFSET);
    if (fixed) {
        return (fixed[1] === "+" ? 1 : -1) * (Number(fixed[2]) * 60 + Number(fixed[3])) * 60_000;
    }
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
        timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(instantMs)).map((part) => [part.type, part.value]));
    const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour), Number(parts.minute), Number(parts.second));
    return wall - Math.floor(instantMs / 1000) * 1000;
}

/** The moment a clock in the zone shows this date and time. */
function fromWallClock(zone, year, monthIndex, day, hours, minutes) {
    const wall = Date.UTC(year, monthIndex, day, hours, minutes);
    // The offset depends on the moment, which depends on the offset: a second look settles summer-time changes.
    const first = wall - offsetAt(zone, wall);
    return new Date(wall - offsetAt(zone, first));
}

/** The date and time a clock in the zone shows at that moment. */
function wallClock(date, zone) {
    const shifted = new Date(date.getTime() + offsetAt(zone, date.getTime()));
    return {
        year: shifted.getUTCFullYear(), monthIndex: shifted.getUTCMonth(), day: shifted.getUTCDate(),
        hours: shifted.getUTCHours(), minutes: shifted.getUTCMinutes(),
    };
}

function endOfDay(date, zone) {
    const { year, monthIndex, day } = wallClock(date, zone);
    return fromWallClock(zone, year, monthIndex, day, END_OF_DAY.hours, END_OF_DAY.minutes);
}

/**
 * @param {string} input
 * @param {{ now?: Date, zone?: string | null }} [options] zone: the person's time zone, UTC when not given
 * @returns {Date | null} null removes the due date
 */
function parseDue(input, { now = new Date(), zone = null } = {}) {
    const text = String(input ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (!text || text === "none" || text === "clear" || text === "remove") {
        return null;
    }
    if (text === "today") {
        return endOfDay(now, zone);
    }
    if (text === "tomorrow") {
        return endOfDay(new Date(now.getTime() + UNIT_MS.day), zone);
    }
    const relative = text.match(/^in (\d{1,4}) (hour|day|week)s?$/);
    if (relative) {
        const amount = Number(relative[1]) * UNIT_MS[relative[2]];
        const date = new Date(now.getTime() + amount);
        return relative[2] === "hour" ? roundToMinute(date) : endOfDay(date, zone);
    }
    const absolute = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ t](\d{1,2}):(\d{2}))?(?: ?(z|utc|[+-]\d{2}:?\d{2}))?$/);
    if (!absolute) {
        throw invalid(input);
    }
    const [, year, month, day, hours, minutes, typedZone] = absolute;
    const check = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    // Date.UTC rolls over impossible dates (Feb 30 becomes March 2); refuse them instead.
    if (check.getUTCFullYear() !== Number(year) || check.getUTCMonth() !== Number(month) - 1
        || check.getUTCDate() !== Number(day) || Number(hours ?? 0) > 23) {
        throw invalid(input);
    }
    // A zone typed with the date wins over the person's own.
    let zoneUsed = zone;
    if (typedZone === "z" || typedZone === "utc") {
        zoneUsed = "UTC";
    } else if (typedZone) {
        const [, sign, offsetHours, offsetMinutes] = typedZone.match(/^([+-])(\d{2}):?(\d{2})$/);
        zoneUsed = `${sign}${offsetHours}:${offsetMinutes}`;
    }
    return fromWallClock(zoneUsed, Number(year), Number(month) - 1, Number(day),
        hours === undefined ? END_OF_DAY.hours : Number(hours),
        minutes === undefined ? END_OF_DAY.minutes : Number(minutes));
}

function roundToMinute(date) {
    return new Date(Math.round(date.getTime() / 60_000) * 60_000);
}

/** How the API wants it: a UTC date and time without a zone. */
function toServerTime(date) {
    return date ? date.toISOString().slice(0, 19) : null;
}

/** For pre-filling a form, in the person's time zone: "2026-10-01 17:00". */
function toInputText(date, zone = null) {
    if (!date) {
        return "";
    }
    const { year, monthIndex, day, hours, minutes } = wallClock(date, zone);
    const pad = (n) => String(n).padStart(2, "0");
    return `${year}-${pad(monthIndex + 1)}-${pad(day)} ${pad(hours)}:${pad(minutes)}`;
}

/** A time zone as people read it: "Europe/Berlin", "UTC+08:00", "UTC". */
function zoneLabel(zone) {
    if (!zone || zone === "UTC") {
        return "UTC";
    }
    return FIXED_OFFSET.test(zone) ? `UTC${zone}` : zone;
}

/** The zone's current offset from UTC, as "UTC+01:00" (or "UTC"). */
function offsetLabel(zone, now = new Date()) {
    const offset = Math.round(offsetAt(zone, now.getTime()) / 60_000);
    if (offset === 0) {
        return "UTC";
    }
    const pad = (n) => String(n).padStart(2, "0");
    const abs = Math.abs(offset);
    return `UTC${offset < 0 ? "-" : "+"}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

module.exports = { EXAMPLES, parseDue, toServerTime, toInputText, isKnownZone, zoneLabel, offsetLabel };
