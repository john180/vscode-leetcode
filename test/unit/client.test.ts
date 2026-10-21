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

test("graphql joins GraphQL errors and does not retry", async () => {
    const originalAdapter = axios.defaults.adapter;
    let calls = 0;
    axios.defaults.adapter = async (config: any): Promise<any> => {
        calls += 1;
        return {
            data: { errors: [{ message: "first" }, { message: "second" }] },
            status: 200,
            statusText: "OK",
            headers: {},
            config,
        };
    };
    try {
        await assert.rejects(graphql(request, "query { ok }"), /first; second/);
        assert.equal(calls, 1);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("graphql rejects an empty data response", async () => {
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = async (config: any): Promise<any> => ({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {},
        config,
    });
    try {
        await assert.rejects(graphql(request, "query { ok }"), /empty GraphQL response/);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("graphql rejects a missing endpoint before making a request", async () => {
    await assert.rejects(
        graphql({ endpoint: "", origin: "https://leetcode.cn" }, "query { ok }"),
        /endpoint is not configured/,
    );
});

test("graphql retries a 500 response and then surfaces the failure", async () => {
    const originalAdapter = axios.defaults.adapter;
    let calls = 0;
    axios.defaults.adapter = async (config: any): Promise<any> => {
        calls += 1;
        const error: any = new Error("server error");
        error.config = config;
        error.response = { status: 500, headers: {} };
        throw error;
    };
    try {
        await assert.rejects(graphql(request, "query { ok }"), /server error/);
        assert.equal(calls, 3);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});

test("graphql does not retry a forbidden response", async () => {
    const originalAdapter = axios.defaults.adapter;
    let calls = 0;
    axios.defaults.adapter = async (config: any): Promise<any> => {
        calls += 1;
        const error: any = new Error("forbidden");
        error.config = config;
        error.response = { status: 403, headers: {} };
        throw error;
    };
    try {
        await assert.rejects(graphql(request, "query { ok }"), /forbidden/);
        assert.equal(calls, 1);
    } finally {
        axios.defaults.adapter = originalAdapter;
    }
});
