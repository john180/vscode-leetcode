import { strict as assert } from "node:assert";
import { test } from "node:test";
import axios from "axios";
import { fetchFavoriteData, mapFavoriteLists, mapHot100List } from "../../src/api/favoriteLists";

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

test("mapHot100List recognizes the global Top 100 Liked list", () => {
    const list = mapHot100List({
        favorites: {
            leetcode_favorites: [
                {
                    id_hash: "global-hot",
                    name: "Top 100 Liked Questions",
                    questions: [{ id: 1, title: "Two Sum", title_slug: "two-sum" }],
                },
            ],
        },
    });
    assert.equal(list?.idHash, "global-hot");
    assert.equal(list?.questions.length, 1);
});

test("fetchFavoriteData returns empty data without a cookie", async () => {
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async () => {
        throw new Error("network should not be called");
    };
    try {
        const data = await fetchFavoriteData({ endpoint: "https://leetcode.com/graphql", origin: "https://leetcode.com", cookie: "" });
        assert.deepEqual(data, { lists: [] });
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("fetchFavoriteData maps an empty payload", async () => {
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config: any) => ({
        data: { favorites: {} },
        status: 200,
        statusText: "OK",
        headers: {},
        config,
    });
    try {
        const data = await fetchFavoriteData({
            endpoint: "https://empty.example/graphql",
            origin: "https://empty.example",
            cookie: "LEETCODE_SESSION=empty; csrftoken=empty",
        }, true);
        assert.deepEqual(data.lists, []);
        assert.equal(data.hot100, undefined);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("fetchFavoriteData caches per origin and cookie and respects forceRefresh", async () => {
    const originalAdapter = axios.defaults.adapter;
    let calls: number = 0;
    axios.defaults.adapter = async (config: any) => {
        calls += 1;
        return {
            data: {
                favorites: {
                    private_favorites: [{ id_hash: "cached", name: "Cached", questions: [] }],
                },
            },
            status: 200,
            statusText: "OK",
            headers: {},
            config,
        };
    };
    try {
        const request = {
            endpoint: "https://cache.example/graphql",
            origin: "https://cache.example",
            cookie: "LEETCODE_SESSION=cache; csrftoken=cache",
        };
        const first = await fetchFavoriteData(request, true);
        const second = await fetchFavoriteData(request);
        assert.equal(calls, 1);
        assert.equal(first.lists.length, 1);
        assert.equal(second.lists[0].name, "Cached");

        await fetchFavoriteData(request, true);
        assert.equal(calls, 2);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});
