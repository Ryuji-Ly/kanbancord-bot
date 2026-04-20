const { ShardingManager } = require("discord.js");
const path = require("node:path");
const { discordBotToken } = require("./config/env");
const logger = require("./utils/logger");

const manager = new ShardingManager(path.join(__dirname, "index.js"), {
    token: discordBotToken,
    totalShards: "auto",
});

manager.on("shardCreate", (shard) => {
    logger.info(`Launched shard ${shard.id}`);
});

manager.spawn().catch((error) => {
    logger.error(`Failed to spawn shards: ${error.message}`);
    process.exit(1);
});
