require("./setup");
const test = require("node:test");
const assert = require("node:assert/strict");

const { describeReminderTimes, formatMinutes, parseReminderTimes } = require("../src/utils/reminderTimes");

test("reminder times are read as people write them, latest first, without repeats", () => {
    assert.deepEqual(parseReminderTimes("1d, 3h"), [1440, 180]);
    assert.deepEqual(parseReminderTimes("30m and 2 days; 1 week"), [10080, 2880, 30]);
    assert.deepEqual(parseReminderTimes("1d 6h, 1 day 6 hours"), [1800], "one time can have several parts");
    assert.deepEqual(parseReminderTimes("1.5h"), [90]);
    assert.deepEqual(parseReminderTimes("none"), [], "only the overdue reminder");
    assert.equal(parseReminderTimes("default"), null, "back to the times above");
    assert.throws(() => parseReminderTimes("tomorrow"), /Could not read \*\*tomorrow\*\*/);
    assert.throws(() => parseReminderTimes("3h, soon"), /Could not read \*\*soon\*\*/);
});

test("reminder times read naturally", () => {
    assert.equal(formatMinutes(1440), "1 day");
    assert.equal(formatMinutes(1500), "1 day 1 hour");
    assert.equal(formatMinutes(20160), "2 weeks");
    assert.equal(describeReminderTimes([1440, 180, 30]), "1 day, 3 hours and 30 minutes before the due date");
    assert.equal(describeReminderTimes([]), "no reminders before the due date");
});
