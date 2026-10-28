const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { request } = require("../api/httpClient");
const { appendText, buildContainer } = require("../ui/containers");
const { getEmoji } = require("../utils/emojis");

/** Up to `good` ms reads as good, up to `okay` as so-so, slower as bad. */
const LIMITS = {
    gateway: { good: 100, okay: 200 },
    discord: { good: 200, okay: 400 },
    api: { good: 100, okay: 300 },
};

function formatUptime(ms) {
    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor(ms / 3_600_000) % 24;
    const minutes = Math.floor(ms / 60_000) % 60;
    const seconds = Math.floor(ms / 1000) % 60;
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

/** One line: the name, a good/medium/bad emoji and the time, or why there is none. */
function latencyLine(label, ms, limits, missing = "unreachable") {
    if (ms === null || ms < 0) {
        return `**${label}** ${getEmoji("bad", "❌")} \`${missing}\``;
    }
    const emoji = ms <= limits.good ? getEmoji("good", "✅") : ms <= limits.okay ? getEmoji("medium", "⚠️") : getEmoji("bad", "❌");
    return `**${label}** ${emoji} \`${Math.round(ms)}ms\``;
}

/**
 * @param {{ gateway: number|null, discord: number|null, api: number|null, uptime: number }} measured
 *   gateway: the shard's heartbeat (-1 until the first one); discord: a request to Discord and back;
 *   api: KanbanCord's API answering its health check; uptime: how long this shard has been connected
 */
function pingView({ gateway, discord, api, uptime }) {
    const container = buildContainer({ title: "Pong!" });
    appendText(container, [
        latencyLine("Discord gateway", gateway, LIMITS.gateway, "measuring"),
        latencyLine("Discord API", discord, LIMITS.discord),
        latencyLine("KanbanCord API", api, LIMITS.api),
        `**Uptime** ${getEmoji("timersand", "🕒")} \`${formatUptime(uptime)}\``,
    ].join("\n"));
    return container;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("How fast KanbanCord answers, and how long it has been up")
        .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM),

    info: {
        description: "Shows the latency to Discord (the bot's connection and a request there and back), to "
            + "KanbanCord's API, and how long the bot has been running.",
        examples: ["/ping"],
        notes: "Good up to 100 ms for Discord's connection and KanbanCord's API, 200 ms for Discord requests; "
            + "a few times that reads as slow.",
    },

    /** @param {import("../utils/interactionContext").InteractionContext} ctx */
    async execute(ctx) {
        // Acknowledging the command is itself a request to Discord: its round trip is the Discord API time.
        const sent = Date.now();
        await ctx.defer({ ephemeral: true });
        const discord = Date.now() - sent;

        let api = null;
        const asked = Date.now();
        try {
            await request("/actuator/health", { timeoutMs: 5000 });
            api = Date.now() - asked;
        } catch {
            api = null;
        }

        const client = ctx.interaction.client;
        await ctx.reply(pingView({ gateway: client.ws.ping, discord, api, uptime: client.uptime ?? 0 }));
    },

    formatUptime,
    pingView,
};
