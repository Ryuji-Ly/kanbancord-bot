const { scheduleChannelSync } = require("../services/sync/syncChannels");

/** Channels are offered by name for notifications; keep the list current. */
module.exports = {
    name: "channelCreate",
    execute(channel) {
        if (channel.guild) {
            scheduleChannelSync(channel.guild);
        }
    },
};
