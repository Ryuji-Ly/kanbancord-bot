/**
 * Converts a Discord snowflake ID (string or bigint) to a string safely.
 * @param {string | bigint | number} id
 * @returns {string}
 */
function snowflakeToString(id) {
    return String(id);
}

module.exports = { snowflakeToString };
