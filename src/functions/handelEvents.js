const path = require("node:path");
const logger = require("../utils/logger");

module.exports = (client) => {
    client.handelEvents = async (eventFiles, eventsPath) => {
        logger.info(`Loading ${eventFiles.length} event listeners`);

        for (const file of eventFiles) {
            const event = require(path.join(eventsPath, file));
            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args, client));
            } else {
                client.on(event.name, (...args) => event.execute(...args, client));
            }
        }
    };
};
