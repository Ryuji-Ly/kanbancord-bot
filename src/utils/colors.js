const { UserFacingError } = require("./errorMessages");

/**
 * Colours for labels and priority levels. The named colours are the website's label palette, so a
 * label made in Discord looks the same as one made there; any hex colour works too.
 */

const PALETTE = [
    { name: "Blue", hex: "#2563eb" },
    { name: "Green", hex: "#16a34a" },
    { name: "Pink", hex: "#db2777" },
    { name: "Purple", hex: "#9333ea" },
    { name: "Orange", hex: "#ea580c" },
    { name: "Cyan", hex: "#0891b2" },
    { name: "Yellow", hex: "#ca8a04" },
    { name: "Indigo", hex: "#4f46e5" },
    { name: "Red", hex: "#dc2626" },
    { name: "Teal", hex: "#0d9488" },
];
/** Offered as a choice but never picked automatically, like on the website. */
const GRAY = { name: "Gray", hex: "#64748b" };
const CHOICES = [...PALETTE, GRAY];

/** The coloured circles Discord can show, with the colour each is drawn in. */
const DOTS = [
    { emoji: "🔴", rgb: [221, 46, 68] },
    { emoji: "🟠", rgb: [244, 144, 12] },
    { emoji: "🟡", rgb: [253, 203, 88] },
    { emoji: "🟢", rgb: [120, 177, 89] },
    { emoji: "🔵", rgb: [85, 172, 238] },
    { emoji: "🟣", rgb: [170, 142, 214] },
    { emoji: "🟤", rgb: [193, 105, 79] },
    { emoji: "⚫", rgb: [49, 55, 61] },
    { emoji: "⚪", rgb: [230, 231, 232] },
];

const HEX = /^#?([0-9a-f]{6})$/i;

function rgbOf(hex) {
    const value = parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** The circle emoji closest to a colour: Discord text cannot show the colour itself. */
function colorDot(hex) {
    if (!HEX.test(String(hex ?? ""))) {
        return "⚪";
    }
    const [r, g, b] = rgbOf(`#${HEX.exec(hex)[1]}`);
    const distance = ({ rgb }) => (rgb[0] - r) ** 2 + (rgb[1] - g) ** 2 + (rgb[2] - b) ** 2;
    return DOTS.reduce((best, dot) => (distance(dot) < distance(best) ? dot : best)).emoji;
}

/**
 * A colour typed or picked from autocomplete: a name from the palette, or a hex colour with or
 * without its "#". Returned as lowercase "#rrggbb".
 */
function parseColor(input) {
    const text = String(input ?? "").trim();
    const named = CHOICES.find((color) => color.name.toLowerCase() === text.toLowerCase());
    if (named) {
        return named.hex;
    }
    const match = HEX.exec(text);
    if (match) {
        return `#${match[1].toLowerCase()}`;
    }
    throw new UserFacingError(
        "Not a colour I understand",
        `"${text}" is not a colour. Pick one from the list, or give a hex colour such as \`#2563eb\`.`,
    );
}

/** The palette colour used least among these, so things created in a row get different colours. */
function nextColor(used) {
    const counts = new Map();
    for (const hex of used) {
        const key = String(hex ?? "").toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return PALETTE.reduce((best, color) => ((counts.get(color.hex) ?? 0) < (counts.get(best.hex) ?? 0) ? color : best)).hex;
}

/** Autocomplete for a colour option: a typed hex colour first, then the named colours that match. */
function colorChoices(typed) {
    const text = String(typed ?? "").trim();
    const choices = [];
    const match = HEX.exec(text);
    if (match) {
        const hex = `#${match[1].toLowerCase()}`;
        choices.push({ name: `${colorDot(hex)} ${hex}`, value: hex });
    }
    const query = text.toLowerCase();
    for (const color of CHOICES) {
        if (!query || match || color.name.toLowerCase().includes(query)) {
            choices.push({ name: `${colorDot(color.hex)} ${color.name}`, value: color.hex });
        }
    }
    return choices.slice(0, 25);
}

module.exports = { PALETTE, colorDot, parseColor, nextColor, colorChoices };
