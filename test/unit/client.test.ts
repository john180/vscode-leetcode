import { strict as assert } from "node:assert";
import { test } from "node:test";
import axios from "axios";
import { graphql } from "../../src/api/client";

const request = {
    endpoint: "https://leetcode.cn/graphql/",
    origin: "https://leetcode.cn",
};

test("graphql retries a 429 response and then succeeds", async () => {
    const originalAdapter = axios.defaults.adapter;
    let calls = 0;
    axios.defaults.adapter = async (config: any): Promise<any> => {
        calls += 1;
        if (calls < 3) {
            const error: any = new Error("rate limited");
            error.config = config;
            error.response = { status: 429, headers: { "retry-after": "0" } };
            throw error;
        }
        return { data: { data: { ok: true } }, status: 200, statusText: "OK", headers: {}, config };
    };
    try {
        const result = await graphql<{ ok: boolean }>(request, "query { ok }");
        assert.equal(result.ok, true);
        assert.equal(calls, 3);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("graphql does not retry an unauthorized response", async () => {
    const originalAdapter = axios.defaults.adapter;
    let calls = 0;
    axios.defaults.adapter = async (config: any): Promise<any> => {
        calls += 1;
        const error: any = new Error("unauthorized");
        error.config = config;
        error.response = { status: 401, headers: {} };
        throw error;
    };
    try {
        await assert.rejects(graphql(request, "query { ok }"));
        assert.equal(calls, 1);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});
