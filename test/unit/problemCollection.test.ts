import { strict as assert } from "node:assert";
import { test } from "node:test";
import { collectProblems } from "../../src/api/problemCollection";

function page(ids: string[]) {
    return {
        total: ids.length,
        questions: ids.map((id) => ({ frontendQuestionId: id })),
    };
}

test("collectProblems maps all pages and removes duplicate ids", () => {
    const problems = collectProblems(
        [page(["1", "2"]), page(["2", "3"])],
        (question) => ({ id: question.frontendQuestionId, name: `problem-${question.frontendQuestionId}` } as any),
    );
    assert.deepEqual(problems.map((problem) => problem.id), ["1", "2", "3"]);
});

test("collectProblems skips empty ids and preserves page order", () => {
    const problems = collectProblems(
        [page(["", "1"]), page(["", "2"])],
        (question) => ({ id: question.frontendQuestionId, name: question.frontendQuestionId } as any),
    );
    assert.deepEqual(problems.map((problem) => problem.name), ["1", "2"]);
});

test("collectProblems passes each question to the mapper", () => {
    const seen: string[] = [];
    collectProblems([page(["4", "5"])], (question) => {
        seen.push(question.frontendQuestionId);
        return { id: question.frontendQuestionId } as any;
    });
    assert.deepEqual(seen, ["4", "5"]);
});