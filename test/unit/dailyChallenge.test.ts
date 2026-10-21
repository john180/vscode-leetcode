import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseDailyChallenge } from "../../src/api/dailyChallenge";

test("parseDailyChallenge reads the homepage SSR daily question", () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
        props: {
            pageProps: {
                HomeSsrData: {
                    taskSchedule: {
                        dailyQuestions: [{ id: "3863", name: "最小操作次数", slug: "minimum-operations", progress: 0 }],
                    },
                },
            },
        },
    })}</script>`;
    const daily = parseDailyChallenge(html);
    assert.equal(daily?.id, "3863");
    assert.equal(daily?.slug, "minimum-operations");
    assert.equal(daily?.name, "最小操作次数");
});

test("parseDailyChallenge ignores malformed or missing data", () => {
    assert.equal(parseDailyChallenge("<html></html>"), undefined);
    assert.equal(parseDailyChallenge('<script id="__NEXT_DATA__" type="application/json">{bad json}</script>'), undefined);
});
