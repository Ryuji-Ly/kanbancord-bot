const fs = require("node:fs");
const path = require("node:path");
const logger = require("../utils/logger");

const interactionsPath = path.join(__dirname, "..", "interactions");

/**
 * Loads every file in `interactions/`. Each registers its own button, menu and modal handlers with
 * the interaction router when it is required.
 */
function loadInteractions() {
    const files = fs.readdirSync(interactionsPath).filter((file) => file.endsWith(".js"));
    for (const file of files) {
        require(path.join(interactionsPath, file));
    }
    logger.info(`Loaded ${files.length} interaction handler files`);
}

module.exports = { loadInteractions };
