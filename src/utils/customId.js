/**
 * Custom ids for buttons, menus and modals: `kc1:<feature>:<action>:<arg>:<arg>...`.
 *
 * The version prefix lets a button posted by an older release be recognised and refused politely
 * instead of being read with a different meaning. Arguments are ids and short keys; they must not
 * contain ":". Discord allows 100 characters in all.
 */

const VERSION = "kc1";
const MAX_LENGTH = 100;

/**
 * @param {string} feature
 * @param {string} action
 * @param {...(string|number)} args
 */
function encode(feature, action, ...args) {
    const parts = [VERSION, feature, action, ...args.map(String)];
    for (const part of parts) {
        if (part.includes(":")) {
            throw new Error(`Custom id part may not contain ":": ${part}`);
        }
    }
    const id = parts.join(":");
    if (id.length > MAX_LENGTH) {
        throw new Error(`Custom id is longer than ${MAX_LENGTH} characters: ${id}`);
    }
    return id;
}

/**
 * @param {string} customId
 * @returns {{ current: boolean, feature: string, action: string, args: string[] } | null}
 *   null when the id is not one of ours; `current: false` when it came from another version.
 */
function decode(customId) {
    const [version, feature, action, ...args] = String(customId).split(":");
    if (!version?.startsWith("kc") || !feature || !action) {
        return null;
    }
    return { current: version === VERSION, feature, action, args };
}

module.exports = { encode, decode, VERSION };
