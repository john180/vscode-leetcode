import { strict as assert } from "node:assert";
import { test } from "node:test";
import { detectEndpointFromTimeZone, isMainlandChinaTimeZone } from "../../src/utils/endpointDetection";

test("isMainlandChinaTimeZone recognizes mainland zones", () => {
    assert.equal(isMainlandChinaTimeZone("Asia/Shanghai"), true);
    assert.equal(isMainlandChinaTimeZone("Asia/Urumqi"), true);
    assert.equal(isMainlandChinaTimeZone("Asia/Hong_Kong"), false);
    assert.equal(isMainlandChinaTimeZone("Asia/Taipei"), false);
    assert.equal(isMainlandChinaTimeZone("America/Los_Angeles"), false);
    assert.equal(isMainlandChinaTimeZone(undefined), false);
});

test("detectEndpointFromTimeZone selects the right site", () => {
    assert.equal(detectEndpointFromTimeZone("Asia/Shanghai"), "leetcode-cn");
    assert.equal(detectEndpointFromTimeZone("Europe/London"), "leetcode");
});
