import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
    formatSubmissionDate,
    formatSubmissionLabel,
    mapSubmissionDump,
} from "../../src/api/submissionHistory";

test("mapSubmissionDump normalizes the REST payload", () => {
    const items = mapSubmissionDump({
        submissions_dump: [
            {
                id: 123,
                status_display: "Accepted",
                lang: "cpp",
                timestamp: "1700000000",
                runtime: "8 ms",
                memory: "8.1 MB",
            },
            { id: 124, status: "Wrong Answer", lang: "python3" },
            { status: "ignored without id" },
        ],
    });
    assert.equal(items.length, 2);
    assert.deepEqual(items[0], {
        id: "123",
        status: "Accepted",
        lang: "cpp",
        timestamp: "1700000000",
        runtime: "8 ms",
        memory: "8.1 MB",
    });
    assert.equal(items[1].status, "Wrong Answer");
});

test("formatSubmissionLabel marks accepted and failed submissions", () => {
    assert.match(formatSubmissionLabel({ id: "1", status: "Accepted", lang: "cpp", timestamp: "", runtime: "", memory: "" }), /\$\(check\)/);
    assert.match(formatSubmissionLabel({ id: "2", status: "Wrong Answer", lang: "cpp", timestamp: "", runtime: "", memory: "" }), /\$\(x\)/);
});

test("formatSubmissionDate keeps unknown values and formats seconds", () => {
    assert.equal(formatSubmissionDate("not-a-date"), "not-a-date");
    assert.match(formatSubmissionDate("1700000000"), /\d{4}/);
});
