require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const { PermissionFlagsBits, PermissionsBitField } = require("discord.js");

const { simpleModeHint, forgetSettled } = require("../src/services/guide/simpleModeHint");

const NONE = { LABELS: false, PRIORITIES: false, ASSIGNEES: false, COMMENTS: false, DUE_DATES: false, PERMISSIONS: false };

function context({ manager = true, commandName = "board", guildId = "999", features = NONE, open = false, boards = [] } = {}) {
    const calls = [];
    return {
        calls,
        ctx: {
            guildId,
            user: { id: "555" },
            interaction: {
                commandName,
                memberPermissions: new PermissionsBitField(manager ? PermissionFlagsBits.ManageGuild : 0n),
            },
            api: {
                get: async (path) => {
                    calls.push(path);
                    if (path === "/features") return features;
                    if (path === "/features/open-permissions") return { enabled: open };
                    return { content: boards };
                },
            },
        },
    };
}

test("the simple-mode tip shows for managers of an untouched server, and stops for good once it is not", async () => {
    forgetSettled();
    assert.match(JSON.stringify((await simpleModeHint(context().ctx)).toJSON()), /simple mode.*\/kanbancord features/s);

    assert.equal(await simpleModeHint(context({ manager: false }).ctx), null, "only for server managers");
    assert.equal(await simpleModeHint(context({ commandName: "kanbancord" }).ctx), null, "not where it would repeat itself");

    const withBoard = context({ guildId: "1", boards: [{ boardId: 1 }] });
    assert.equal(await simpleModeHint(withBoard.ctx), null, "a board, even an empty one");
    const again = context({ guildId: "1" });
    assert.equal(await simpleModeHint(again.ctx), null, "and it never comes back");
    assert.deepEqual(again.calls, [], "without asking again");

    assert.equal(await simpleModeHint(context({ guildId: "2", features: { ...NONE, LABELS: true } }).ctx), null, "a feature on");
    assert.equal(await simpleModeHint(context({ guildId: "3", open: true }).ctx), null, "open permissions on");

    const failing = context({ guildId: "4" });
    failing.ctx.api.get = async () => { throw new Error("API down"); };
    assert.equal(await simpleModeHint(failing.ctx), null, "never breaks a command");
});
