require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Collection } = require("discord.js");

const { encode, decode } = require("../src/utils/customId");
const { describeError, UserFacingError } = require("../src/utils/errorMessages");
const { ApiError } = require("../src/api/httpClient");

test("custom ids round-trip, and ids from another version are recognised as outdated", () => {
    const id = encode("task", "move", 42, "7");
    assert.equal(id, "kc1:task:move:42:7");
    assert.deepEqual(decode(id), { current: true, feature: "task", action: "move", args: ["42", "7"] });
    assert.equal(decode("kc0:task:move:1").current, false);
    assert.equal(decode("someone-else:button"), null);
    assert.throws(() => encode("task", "a:b"));
    assert.throws(() => encode("task", "x", "9".repeat(100)));
});

test("errors are described for people: the API's reason when it gave one, never internals", () => {
    assert.deepEqual(describeError(new ApiError("Labels are turned off on this server.", 409)), {
        title: "That did not work",
        body: "Labels are turned off on this server.",
        unexpected: false,
    });
    assert.equal(describeError(new ApiError("Access denied", 403)).body, "Access denied");
    assert.equal(describeError(new ApiError("stack trace here", 500)).body, "Try again in a moment.");
    assert.equal(describeError(new ApiError("fetch failed", 0)).unexpected, true);
    assert.equal(describeError(new UserFacingError("Slow down", "Wait 5s.")).body, "Wait 5s.");
    assert.equal(describeError(new TypeError("x is undefined")).body, "Try again in a moment.");
});

test("every command loads and serialises, and /help lists them all", () => {
    const commands = new Collection();
    const dir = path.join(__dirname, "..", "src", "commands");
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".js"))) {
        const command = require(path.join(dir, file));
        const json = command.data.toJSON();
        assert.match(json.name, /^[a-z-]{1,32}$/);
        commands.set(json.name, command);
    }
    const { buildHelp } = require("../src/services/help/helpService");
    const help = JSON.stringify(buildHelp(commands).toJSON());
    for (const name of commands.keys()) {
        assert.ok(help.includes(`/${name}`), `help mentions /${name}`);
    }
});

test("every interaction file loads and registers without clashing", () => {
    const dir = path.join(__dirname, "..", "src", "interactions");
    for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".js"))) {
        require(path.join(dir, file));
    }
});

test("the report form is valid, and repeated reports are held back", () => {
    const { buildReportModal, claimCooldown } = require("../src/services/report/reportService");
    const modal = buildReportModal("suggestion").toJSON();
    assert.equal(modal.custom_id, "kc1:report:submit:suggestion");
    assert.equal(modal.components.length, 2);

    claimCooldown("u1", 1_000);
    assert.throws(() => claimCooldown("u1", 30_000), /another report in 31s/);
    assert.doesNotThrow(() => claimCooldown("u1", 61_001));
});
