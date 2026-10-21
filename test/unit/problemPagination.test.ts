import { strict as assert } from "node:assert";
import { test } from "node:test";
import { loadGlobalQuestionPages } from "../../src/api/problemPagination";

function page(count: number) {
    return { total: 0, questions: Array.from({ length: count }, (_, index) => ({ frontendQuestionId: String(index) })) };
}

test("loadGlobalQuestionPages stops after the first short page", async () => {
    const calls: Array<[number, number]> = [];
    const pages = await loadGlobalQuestionPages(async (skip, limit) => {
        calls.push([skip, limit]);
        return page(skip === 0 ? 3 : skip === 3 ? 3 : 2);
    }, 3, 2);
    assert.equal(pages.length, 3);
    assert.deepEqual(calls, [[0, 3], [3, 3], [6, 3]]);
});

test("loadGlobalQuestionPages handles a first page smaller than pageSize", async () => {
    const calls: number[] = [];
    const pages = await loadGlobalQuestionPages(async (skip) => {
        calls.push(skip);
        return page(2);
    }, 3, 2);
    assert.equal(pages.length, 1);
    assert.deepEqual(calls, [0]);
});

test("loadGlobalQuestionPages stops when an exact multiple ends with an empty page", async () => {
    const calls: number[] = [];
    const pages = await loadGlobalQuestionPages(async (skip) => {
        calls.push(skip);
        return page(skip < 9 ? 3 : 0);
    }, 3, 1);
    assert.deepEqual(calls, [0, 3, 6, 9]);
    assert.equal(pages.reduce((total, item) => total + item.questions.length, 0), 9);
});
