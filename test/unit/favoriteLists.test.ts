import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mapFavoriteLists, mapHot100List } from "../../src/api/favoriteLists";

test("mapFavoriteLists keeps private and public lists", () => {
    const lists = mapFavoriteLists({
        favorites: {
            private_favorites: [
                {
                    id_hash: "private-1",
                    name: "Favorite",
                    questions: [{ id: 1, title: "Two Sum", title_slug: "two-sum" }],
                },
            ],
            public_favorites: [
                {
                    id_hash: "public-1",
                    name: "Interview",
                    questions: [{ id: 2, title: "Three Sum", title_slug: "3sum" }],
                },
            ],
        },
    });
    assert.equal(lists.length, 2);
    assert.equal(lists[0].name, "Favorite");
    assert.equal(lists[0].questions[0].titleSlug, "two-sum");
    assert.equal(lists[1].idHash, "public-1");
});

test("mapFavoriteLists ignores malformed lists and questions", () => {
    const lists = mapFavoriteLists({
        favorites: {
            private_favorites: [
                { name: "missing hash", questions: [] },
                { id_hash: "ok", name: "Empty", questions: [{ title: "" }, { title: "Valid", title_slug: "valid" }] },
            ],
        },
    });
    assert.equal(lists.length, 1);
    assert.equal(lists[0].questions.length, 1);
});

test("mapHot100List selects the official HOT 100 list", () => {
    const list = mapHot100List({
        favorites: {
            leetcode_favorites: [
                { id_hash: "other", name: "Study Plan", questions: [] },
                {
                    id_hash: "2cktkvj",
                    name: "🔥  LeetCode 热题 HOT 100",
                    questions: [{ id: 1, title: "Two Sum", title_slug: "two-sum" }],
                },
            ],
        },
    });
    assert.equal(list?.idHash, "2cktkvj");
    assert.equal(list?.questions.length, 1);
});
