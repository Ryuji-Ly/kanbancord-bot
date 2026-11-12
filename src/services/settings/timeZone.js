const { successContainer } = require("../../ui/containers");
const { isKnownZone, offsetLabel, zoneLabel } = require("../../utils/dueDate");
const logger = require("../../utils/logger");

/**
 * Each person's time zone, for reading the times they type. Discord does not tell bots anyone's, so the website
 * saves it from their device, or they choose one with /notifications timezone:. Kept for a few minutes per person,
 * so typing a due date does not cost an extra request every time.
 */

const CACHE_MS = 5 * 60_000;
const AUTOCOMPLETE_MAX = 25;
const FORGET = ["none", "forget", "reset", "clear"];
const OFFSET_QUERY = /^(?:utc|gmt)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i;

/** The line added where a typed time was read as UTC because no time zone is known. */
const UTC_NOTE = "Read as UTC: set your time zone with `/notifications timezone:`, or type an offset like +02:00.";

const cache = new Map();
let zones = null;

function remember(userId, zone) {
    cache.set(String(userId), { zone, at: Date.now() });
}

/** @returns {Promise<string | null>} the person's time zone, or null when it is not known (read as UTC) */
async function myTimeZone(ctx) {
    const cached = cache.get(String(ctx.user.id));
    if (cached && Date.now() - cached.at < CACHE_MS) {
        return cached.zone;
    }
    try {
        const { timeZone } = await ctx.api.myTimeZone.get();
        const zone = timeZone && isKnownZone(timeZone) ? timeZone : null;
        remember(ctx.user.id, zone);
        return zone;
    } catch (error) {
        // Reading a date in UTC, with the note saying so, is better than refusing it.
        logger.warn(`[TimeZone] Could not read ${ctx.user.id}'s time zone: ${error.message}`);
        return null;
    }
}

/** /notifications timezone: saves the person's choice, or forgets it so the website sets it from the device. */
async function setMyTimeZone(ctx, input) {
    const forget = FORGET.includes(input.trim().toLowerCase());
    const { timeZone } = await ctx.api.myTimeZone.update({ timeZone: forget ? null : input.trim() });
    remember(ctx.user.id, timeZone && isKnownZone(timeZone) ? timeZone : null);
    if (!timeZone) {
        return successContainer("Time zone forgotten", "Times you type in Discord are read as UTC until you open the "
            + "website, which sets your time zone from your device, or until you choose one here.");
    }
    const fixed = /^[+-]/.test(timeZone);
    return successContainer("Time zone saved", `Times you type in Discord, such as due dates, are read in `
        + `**${zoneLabel(timeZone)}**${fixed ? "" : ` (${offsetLabel(timeZone)} now)`}. Everyone sees due dates in their `
        + "own time."
        + (fixed && timeZone !== "UTC"
            ? "\n-# A fixed offset does not change for summer time. If your clocks change, choose your place instead, "
                + "such as Europe/Berlin."
            : ""));
}

function allZones() {
    zones ??= ["UTC", ...Intl.supportedValuesOf("timeZone").filter((zone) => zone !== "UTC")];
    return zones;
}

/** Autocomplete for /notifications timezone: places by name, or every place at a typed offset. */
function timeZoneChoices(query, now = new Date()) {
    const text = String(query ?? "").trim();
    const choice = (zone) => ({ name: `${zoneLabel(zone)} (${offsetLabel(zone, now)} now)`.slice(0, 100), value: zone });
    const offset = text.match(OFFSET_QUERY);
    if (offset) {
        const pad = (n) => String(n).padStart(2, "0");
        const fixed = `${offset[1]}${pad(Number(offset[2]))}:${offset[3] ?? "00"}`;
        const label = offsetLabel(fixed, now);
        const places = allZones().filter((zone) => offsetLabel(zone, now) === label);
        return [{ name: `${label}, all year`, value: fixed }, ...places.map(choice)].slice(0, AUTOCOMPLETE_MAX);
    }
    const wanted = text.toLowerCase().replace(/\s+/g, "_");
    const matches = allZones().filter((zone) => zone.toLowerCase().includes(wanted)).map(choice);
    const forget = !text || "forget".startsWith(wanted)
        ? [{ name: "Forget mine (the website sets it from your device)", value: "none" }]
        : [];
    return [...forget, ...matches].slice(0, AUTOCOMPLETE_MAX);
}

module.exports = { UTC_NOTE, myTimeZone, setMyTimeZone, timeZoneChoices };
