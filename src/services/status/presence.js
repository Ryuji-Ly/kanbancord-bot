const { ActivityType } = require("discord.js");
const logger = require("../../utils/logger");
const { totals } = require("../listings/listingStats");
const { fetchBotStats } = require("../../api/syncApi");

/**
 * The bot's status in Discord: it rotates through a few lines with live numbers (servers, members,
 * boards, tasks) and a pointer for newcomers. Every shard shows its own status, so every shard runs
 * this. The numbers are refreshed every 10 minutes; one that cannot be fetched keeps its last value,
 * and one never fetched is left out rather than shown as 0.
 */

const ROTATE_MS = 30_000;
const FIRST_REFRESH_MS = 60_000;
const REFRESH_MS = 10 * 60_000;

const number = new Intl.NumberFormat("en");
const count = (n, one, many) => `${number.format(n)} ${n === 1 ? one : many}`;
const custom = (state) => ({ type: ActivityType.Custom, name: "Custom Status", state });

/**
 * The lines to rotate through, for the numbers known so far.
 * @param {{ guilds?: number, users?: number, boards?: number, tasks?: number }} stats
 */
function activities(stats = {}) {
    const lines = [];
    if (stats.guilds) {
        lines.push({ type: ActivityType.Watching, name: count(stats.guilds, "server", "servers") });
    }
    if (stats.boards) {
        lines.push({ type: ActivityType.Watching, name: count(stats.boards, "kanban board", "kanban boards") });
    }
    if (stats.tasks) {
        lines.push(custom(`📋 Keeping track of ${count(stats.tasks, "task", "tasks")}`));
    }
    if (stats.users) {
        lines.push(custom(`👥 Helping ${count(stats.users, "member", "members")} get organised`));
    }
    lines.push({ type: ActivityType.Listening, name: "/help" });
    lines.push(custom("New here? Try /guide"));
    return lines;
}

/** Starts rotating the status. Call once per shard, when it is ready. Returns a function that stops it. */
function startPresence(client) {
    let stats = {};
    let index = 0;

    const show = () => {
        const lines = activities(stats);
        const activity = lines[index % lines.length];
        index += 1;
        try {
            client.user.setPresence({ status: "online", activities: [activity] });
        } catch (error) {
            logger.warn(`[Presence] Could not set the status: ${error.message}`);
        }
    };

    const refresh = async () => {
        const [discord, kanban] = await Promise.allSettled([totals(client), fetchBotStats()]);
        if (discord.status === "fulfilled") {
            stats = { ...stats, guilds: discord.value.guilds, users: discord.value.users };
        }
        if (kanban.status === "fulfilled" && kanban.value) {
            stats = { ...stats, boards: Number(kanban.value.boards), tasks: Number(kanban.value.tasks) };
        }
        if (kanban.status === "rejected") {
            logger.warn(`[Presence] Could not fetch board and task totals: ${kanban.reason?.message}`);
        }
    };

    show();
    refresh().catch(() => {});
    // Again once every shard is up, so the server and member totals are complete.
    const first = setTimeout(() => refresh().catch(() => {}), FIRST_REFRESH_MS);
    const refreshing = setInterval(() => refresh().catch(() => {}), REFRESH_MS);
    const rotating = setInterval(show, ROTATE_MS);
    return () => {
        clearTimeout(first);
        clearInterval(refreshing);
        clearInterval(rotating);
    };
}

module.exports = { activities, startPresence };
