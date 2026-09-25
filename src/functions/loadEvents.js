const fs = require("node:fs");
const path = require("node:path");
const logger = require("../utils/logger");

const eventsPath = path.join(__dirname, "..", "events");

/** Subscribes every file in `events/`; each exports `name`, `execute`, and optionally `once`. */
function loadEvents(client) {
    const files = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"));
    for (const file of files) {
        const event = require(path.join(eventsPath, file));
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
    }
    logger.info(`Loaded ${files.length} event listeners`);
}

module.exports = { loadEvents };
