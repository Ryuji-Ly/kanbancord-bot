require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");
const { ChannelType, Collection, PermissionFlagsBits, PermissionsBitField } = require("discord.js");

const { snapshotFixture, textLength } = require("./fixtures");
const { snapshotModel } = require("../src/services/boards/boardData");
const { channelAudience, requireCanPost } = require("../src/services/boards/boardPosts");
const { runOnce } = require("../src/delivery/postWorker");
const views = require("../src/ui/postViews");
const { v2Payload } = require("../src/ui/containers");
const { decode } = require("../src/utils/customId");

/** Every component in a message, nested ones included; Discord allows 40. */
function componentCount(json) {
    return (json.components ?? []).reduce((sum, child) => sum + 1 + componentCount(child), 0);
}

test("a board post shows the whole board and opens columns and tasks privately", () => {
    const model = snapshotModel(snapshotFixture({ tasks: 40, longText: true }));
    const json = views.buildBoardPost(model, { now: new Date("2026-09-28T10:00:00Z") }).toJSON();
    assert.ok(textLength(json) < 4000, `text is ${textLength(json)} characters`);
    assert.ok(componentCount(json) + 1 <= 40);
    const text = JSON.stringify(json);
    assert.match(text, /\+30 more/, "ten tasks per column, the rest counted");
    assert.match(text, /Updates by itself · last updated <t:1790589600:R>/);

    const ids = text.match(/kc1:[^"]+/g);
    assert.deepEqual(ids.map((id) => decode(id).action), ["column", "task", "add"]);
    ids.forEach((id) => assert.equal(decode(id).feature, "post", "nothing on a post changes the post itself"));
    const taskMenu = json.components.find((row) => row.components?.[0]?.custom_id === "kc1:post:task:1").components[0];
    assert.equal(taskMenu.options.length, 25);
    assert.match(taskMenu.placeholder, /first 25/);

    const archived = snapshotModel({ ...snapshotFixture(), board: { ...snapshotFixture().board, isArchived: true } });
    assert.ok(!JSON.stringify(views.buildBoardPost(archived).toJSON()).includes("kc1:post:add"), "archived boards take no new tasks");
    const empty = snapshotModel({ ...snapshotFixture({ tasks: 0 }), columns: [] });
    const emptyJson = JSON.stringify(views.buildBoardPost(empty).toJSON());
    assert.match(emptyJson, /no columns yet/);
    assert.ok(!emptyJson.includes("kc1:post:"), "nothing to open or add to");
});

test("the new-task form from a post asks which column, starting with the first", () => {
    const json = views.postTaskModal(snapshotModel(snapshotFixture())).toJSON();
    assert.equal(json.custom_id, "kc1:post:create:1");
    assert.ok(json.title.length <= 45);
    assert.equal(json.components.length, 5, "title, description, column, then as many extras as fit");
    const select = json.components[2].component;
    assert.equal(select.custom_id, "column");
    assert.deepEqual(select.options.map((option) => [option.value, Boolean(option.default)]),
        [["10", true], ["11", false], ["12", false]]);
});

test("the warning before posting names a few people, without pinging them", () => {
    const warning = views.audienceWarning(1, "Staff *board*", { hidden: 12, hiddenUserIds: ["111", "222"] });
    const text = JSON.stringify(warning.toJSON());
    assert.match(text, /\*\*12 people\*\* who can see this channel cannot see \*\*Staff \\\\\*board\\\\\*\*\*/);
    assert.match(text, /<@111>, <@222> and 10 more/);
    assert.deepEqual(v2Payload(warning).allowedMentions, { parse: [] });
    assert.deepEqual(text.match(/kc1:[^"]+/g), ["kc1:post:confirm:1", "kc1:post:cancel:1"]);
});

test("redrawing: one copy per board, deleted boards say so, and lost or stuck posts are reported", async () => {
    const posts = [
        { postId: "1", serverId: "999", boardId: "1", channelId: "c1", messageId: "m1", boardExists: true },
        { postId: "2", serverId: "999", boardId: "1", channelId: "c2", messageId: "m2", boardExists: true },
        { postId: "3", serverId: "999", boardId: "2", channelId: "c1", messageId: "m3", boardExists: false },
        { postId: "4", serverId: "999", boardId: "1", channelId: "c1", messageId: "gone", boardExists: true },
        { postId: "5", serverId: "999", boardId: "1", channelId: "archived", messageId: "m5", boardExists: true },
        { postId: "6", serverId: "999", boardId: "1", channelId: "c1", messageId: "broken", boardExists: true },
        { postId: "7", serverId: "999", boardId: "3", channelId: "c1", messageId: "m7", boardExists: true },
        { postId: "8", serverId: "999", boardId: "1", channelId: "hidden", messageId: "m8", boardExists: true },
    ];
    const snapshots = [];
    const edits = [];
    const reopened = [];
    let reported;
    const api = {
        claimPosts: async () => posts,
        postSnapshot: async (serverId, boardId) => {
            snapshots.push(boardId);
            if (boardId === "3") {
                throw Object.assign(new Error("Board not found"), { status: 404 });
            }
            return snapshotFixture();
        },
        reportPosts: async (outcome) => {
            reported = outcome;
            return { tell: [{ postId: "8", serverId: "999", channelId: "hidden", boardName: "Sprint" }] };
        },
    };
    const reopenedThreads = new Set();
    const editor = {
        edit: async (channelId, messageId, containers) => {
            if (messageId === "gone") {
                throw Object.assign(new Error("Unknown Message"), { code: 10008 });
            }
            if (channelId === "hidden") {
                throw Object.assign(new Error("Missing Access"), { code: 50001 });
            }
            if (messageId === "broken") {
                throw Object.assign(new Error("Service unavailable"), { status: 503 });
            }
            if (channelId === "archived" && !reopenedThreads.has(channelId)) {
                throw Object.assign(new Error("Thread is archived"), { code: 50083 });
            }
            edits.push({ messageId, text: JSON.stringify(containers.map((container) => container.toJSON())) });
        },
        reopenThread: async (channelId) => {
            reopened.push(channelId);
            reopenedThreads.add(channelId);
        },
        tellBlocked: async (serverId, blocked) => told.push({ serverId, blocked }),
    };
    const told = [];

    assert.equal(await runOnce(editor, api), 8);
    assert.deepEqual(snapshots, ["1", "3"], "one copy of each board; none for a board known to be deleted");
    assert.deepEqual(reopened, ["archived"]);
    assert.deepEqual(reported, { done: ["1", "2", "5"], gone: ["3", "4", "7"], retry: ["6"], blocked: ["8"] },
        "a post the bot may no longer edit is blocked, not given up on");
    assert.deepEqual(told, [{ serverId: "999", blocked: [{ postId: "8", serverId: "999", channelId: "hidden", boardName: "Sprint" }] }],
        "the server is told about the posts KanbanCord says it has not been told about yet");
    const deleted = edits.filter((edit) => edit.text.includes("Board deleted")).map((edit) => edit.messageId);
    assert.deepEqual(deleted, ["m3", "m7"], "a deleted board's posts say so once, then are removed");
    assert.match(edits.find((edit) => edit.messageId === "m1").text, /Sprint/);

    assert.equal(await runOnce(editor, { ...api, claimPosts: async () => [] }), 0, "nothing claimed, nothing reported");
});

/** A guild with members, some bots, and channel permissions decided by a function. */
function fakeGuild(members) {
    const cache = new Collection(members.map((member) => [member.id, { id: member.id, user: { bot: Boolean(member.bot) } }]));
    return {
        id: "999",
        memberCount: cache.size,
        client: { user: { id: "bot" } },
        members: { cache, fetch: async () => cache },
    };
}

test("a post's audience: who can see the channel, or for a private thread its members, never bots", async () => {
    const guild = fakeGuild([{ id: "1" }, { id: "2" }, { id: "3" }, { id: "robot", bot: true }]);
    const sees = (ids) => (member) => new PermissionsBitField(ids.includes(member.id) ? PermissionFlagsBits.ViewChannel : 0n);
    const channel = { guild, type: ChannelType.GuildText, isThread: () => false, permissionsFor: sees(["1", "2", "robot"]) };
    assert.deepEqual(await channelAudience(channel), ["1", "2"]);

    const publicThread = { guild, type: ChannelType.PublicThread, isThread: () => true, parent: channel };
    assert.deepEqual(await channelAudience(publicThread), ["1", "2"], "a public thread is as visible as its channel");

    const privateThread = {
        guild,
        type: ChannelType.PrivateThread,
        isThread: () => true,
        parent: channel,
        members: { fetch: async () => new Collection([["3", {}], ["robot", {}], ["bot", {}]]) },
    };
    assert.deepEqual(await channelAudience(privateThread), ["3"], "a private thread is only visible to its members");
});

test("posting is refused early where the bot could not keep the post up to date", () => {
    const ctxWith = (bits) => ({ interaction: { appPermissions: new PermissionsBitField(bits) } });
    const text = { id: "77", isTextBased: () => true, isDMBased: () => false, isThread: () => false };
    assert.throws(() => requireCanPost(ctxWith(0n), text), /I'm missing View Channel and Send Messages in <#77>/);
    assert.throws(() => requireCanPost(ctxWith(PermissionFlagsBits.ViewChannel), text), /I'm missing Send Messages in <#77>/);
    requireCanPost(ctxWith(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages), text);

    const thread = { ...text, isThread: () => true, locked: false };
    assert.throws(() => requireCanPost(ctxWith(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages), thread),
        /Send Messages in Threads/);
    assert.throws(() => requireCanPost(ctxWith(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessagesInThreads),
        { ...thread, locked: true }), /locked/);
    assert.throws(() => requireCanPost(ctxWith(0n), null), /text channels and threads/);
});
