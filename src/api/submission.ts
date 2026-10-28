// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import axios from "axios";
import { IGraphQLRequest } from "./client";

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_POLL_TIMEOUT_MS = 90000;
const DEFAULT_RATE_LIMIT_DELAY_MS = 2000;

export interface ISubmissionOptions {
    pollIntervalMs?: number;
    pollTimeoutMs?: number;
    rateLimitDelayMs?: number;
}

export interface IProblemSubmissionTarget {
    slug: string;
    questionId: string;
}

/** One case of a test run. */
export interface ITestCaseResult {
    /** The input lines as the judge reads them. */
    input?: string;
    output?: string;
    expected?: string;
    stdout?: string;
    /** Undefined when the judge did not get to compare this case. */
    passed?: boolean;
}

export interface ISubmissionResult {
    state: string;
    statusMessage: string;
    runtime?: string;
    memory?: string;
    /** Share of accepted submissions this one beats, in percent. */
    runtimePercentile?: number;
    memoryPercentile?: number;
    /** The language's display name, which the percentiles are among. */
    language?: string;
    totalCorrect?: number;
    totalTestcases?: number;
    compileError?: string;
    runtimeError?: string;
    /** Submissions: the answer to the failing case. */
    codeOutput?: string;
    expectedOutput?: string;
    /** What the code printed, when it is not reported per case. */
    stdout?: string;
    lastTestcase?: string;
    /** Test runs: one entry per test case. */
    cases?: ITestCaseResult[];
    /** Test runs: the whole input, when it could not be split into the cases. */
    input?: string;
    submissionUrl?: string;
    /** Set by the caller to label input lines with the function's parameters. */
    paramNames?: string[];
}

/** The judge's check response. A test run reports answers in `code_answer` and prints in `code_output`. */
interface ICheckResponse {
    state?: string;
    status_msg?: string;
    status_runtime?: string;
    status_memory?: string;
    memory?: string | number;
    runtime_percentile?: number | null;
    memory_percentile?: number | null;
    lang?: string;
    pretty_lang?: string;
    total_correct?: number;
    total_testcases?: number;
    correct_answer?: boolean;
    full_compile_error?: string;
    full_runtime_error?: string;
    code_answer?: string[];
    expected_code_answer?: string[];
    code_output?: string | string[];
    expected_output?: string | string[];
    std_output?: string;
    std_output_list?: string[];
    last_testcase?: string;
    /** One "1" or "0" per test case. */
    compare_result?: string;
}

interface ISubmitResponse {
    submission_id?: string | number;
}

interface ITestResponse {
    interpret_id?: string | number;
}

function getCsrfToken(cookie: string | undefined): string {
    const match: RegExpMatchArray | null = (cookie || "").match(/(?:^|;\s*)csrftoken=([^;]+)/);
    if (!match) {
        throw new Error("The cookie does not contain csrftoken.");
    }
    return match[1];
}

function getHeaders(request: IGraphQLRequest, slug: string): { [key: string]: string } {
    if (!request.cookie) {
        throw new Error("Not signed in. Please sign in to LeetCode first.");
    }
    return {
        "cookie": request.cookie,
        "x-csrftoken": getCsrfToken(request.cookie),
        "x-requested-with": "XMLHttpRequest",
        "origin": request.origin,
        "referer": `${request.origin}/problems/${slug}/`,
        "content-type": "application/json",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) vscode-leetcode/0.19",
    };
}

function toStringValue(value: string | string[] | undefined): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    return Array.isArray(value) ? value.join("\n") : value;
}

/** Printed output, or undefined when nothing but whitespace was printed. */
function toPrinted(value: string | string[] | undefined): string | undefined {
    const text: string | undefined = toStringValue(value);
    return text?.trim() ? text : undefined;
}

function toPercentile(value: number | null | undefined): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function formatRuntime(value: string | number | undefined): string | undefined {
    if (value === undefined || value === null || value === "" || value === "N/A") {
        return undefined;
    }
    const text: string = String(value);
    return /ms$/i.test(text) ? text : `${text} ms`;
}

function formatMemory(value: string | number | undefined): string | undefined {
    if (value === undefined || value === null || value === "" || value === "N/A") {
        return undefined;
    }
    const text: string = String(value);
    if (/mb$/i.test(text)) {
        return text;
    }
    const bytes: number = Number(value);
    if (!Number.isFinite(bytes)) {
        return text;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mapCommon(data: ICheckResponse): ISubmissionResult {
    return {
        state: data.state || "UNKNOWN",
        statusMessage: data.status_msg || data.state || "Unknown result",
        runtime: formatRuntime(data.status_runtime),
        memory: formatMemory(data.status_memory || data.memory),
        runtimePercentile: toPercentile(data.runtime_percentile),
        memoryPercentile: toPercentile(data.memory_percentile),
        language: data.pretty_lang || data.lang || undefined,
        totalCorrect: data.total_correct,
        totalTestcases: data.total_testcases,
        compileError: data.full_compile_error || undefined,
        runtimeError: data.full_runtime_error || undefined,
    };
}

function mapSubmission(data: ICheckResponse, submissionUrl: string): ISubmissionResult {
    return {
        ...mapCommon(data),
        codeOutput: toStringValue(data.code_output),
        expectedOutput: toStringValue(data.expected_output),
        stdout: toPrinted(data.std_output),
        lastTestcase: data.last_testcase,
        submissionUrl,
    };
}

/** Each case reads the same number of input lines. */
function splitTestInput(input: string, count: number): string[] {
    const lines: string[] = input.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
    if (count === 0 || lines.length % count !== 0) {
        return [];
    }
    const size: number = lines.length / count;
    return Array.from({ length: count }, (_: unknown, index: number) => lines.slice(index * size, (index + 1) * size).join("\n"));
}

function mapTestRun(data: ICheckResponse, input: string): ISubmissionResult {
    const common: ISubmissionResult = mapCommon(data);
    const answers: string[] = data.code_answer ?? [];
    const expected: string[] = data.expected_code_answer ?? [];
    const count: number = Math.max(answers.length, expected.length);
    const inputs: string[] = splitTestInput(input, count);
    const cases: ITestCaseResult[] = Array.from({ length: count }, (_: unknown, index: number) => {
        const compared: string | undefined = data.compare_result?.[index];
        return {
            input: inputs[index],
            output: answers[index],
            expected: expected[index],
            stdout: toPrinted(data.std_output_list?.[index]),
            passed: compared !== undefined ? compared === "1"
                : data.correct_answer === true || (answers[index] !== undefined && expected[index] !== undefined ? answers[index] === expected[index] : undefined),
        };
    });
    return {
        ...common,
        // A test run is "Accepted" once the code runs, whether or not its answers match.
        statusMessage: data.correct_answer === false && common.statusMessage === "Accepted" ? "Wrong Answer" : common.statusMessage,
        stdout: cases.some((testCase: ITestCaseResult) => testCase.stdout) ? undefined : toPrinted(data.code_output),
        lastTestcase: data.last_testcase,
        cases: count > 0 ? cases : undefined,
        input: count > 0 && inputs.length === 0 ? input : undefined,
    };
}

function delay(ms: number): Promise<void> {
    return new Promise<void>((resolve: () => void): void => {
        setTimeout(resolve, ms);
    });
}

async function pollResult(
    request: IGraphQLRequest,
    checkId: string,
    slug: string,
    options: ISubmissionOptions = {},
): Promise<ICheckResponse> {
    const headers: { [key: string]: string } = getHeaders(request, slug);
    const intervalMs: number = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const timeoutMs: number = options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
    const startedAt: number = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const response = await axios.get<ICheckResponse>(
            `${request.origin}/submissions/detail/${checkId}/check/`,
            { headers, timeout: 15000 },
        );
        const state: string = response.data.state || "";
        if (state && state !== "PENDING" && state !== "STARTED") {
            return response.data;
        }
        await delay(intervalMs);
    }
    throw new Error("Timed out while waiting for the judge result.");
}

async function postJson(
    request: IGraphQLRequest,
    slug: string,
    path: string,
    body: { [key: string]: string | number | boolean },
    options: ISubmissionOptions = {},
): Promise<{ [key: string]: unknown }> {
    const headers: { [key: string]: string } = getHeaders(request, slug);
    const retryDelayMs: number = options.rateLimitDelayMs ?? DEFAULT_RATE_LIMIT_DELAY_MS;
    for (let attempt: number = 0; attempt < 3; attempt += 1) {
        try {
            const response = await axios.post<{ [key: string]: unknown }>(
                `${request.origin}${path}`,
                body,
                { headers, timeout: 20000 },
            );
            const data: { [key: string]: unknown } = response.data;
            const bodyError: string = typeof data.error === "string" ? data.error : "";
            if (bodyError) {
                if (bodyError.includes("too soon")) {
                    await delay(retryDelayMs * (attempt + 1));
                    continue;
                }
                throw new Error(bodyError);
            }
            return data;
        } catch (error) {
            const data: { error?: string } | undefined = (error as { response?: { data?: { error?: string } } } | undefined)?.response?.data;
            const message: string = data?.error || "";
            if (message.includes("too soon")) {
                await delay(retryDelayMs * (attempt + 1));
                continue;
            }
            throw error;
        }
    }
    throw new Error("LeetCode is rate limiting test runs. Please try again shortly.");
}

export async function submitSolution(
    request: IGraphQLRequest,
    target: IProblemSubmissionTarget,
    language: string,
    code: string,
    options: ISubmissionOptions = {},
): Promise<ISubmissionResult> {
    const data = await postJson(request, target.slug, `/problems/${encodeURIComponent(target.slug)}/submit/`, {
        lang: language,
        question_id: Number(target.questionId),
        test_mode: false,
        typed_code: code,
        judge_type: "large",
    }, options);
    const submissionId: unknown = (data as ISubmitResponse).submission_id;
    if (submissionId === undefined || submissionId === null) {
        throw new Error("LeetCode did not return a submission id.");
    }
    const id: string = String(submissionId);
    return mapSubmission(await pollResult(request, id, target.slug, options), `${request.origin}/submissions/detail/${encodeURIComponent(id)}/`);
}

export async function testSolution(
    request: IGraphQLRequest,
    target: IProblemSubmissionTarget,
    language: string,
    code: string,
    testInput: string,
    options: ISubmissionOptions = {},
): Promise<ISubmissionResult> {
    const data = await postJson(request, target.slug, `/problems/${encodeURIComponent(target.slug)}/interpret_solution/`, {
        lang: language,
        question_id: Number(target.questionId),
        test_mode: false,
        typed_code: code,
        data_input: testInput,
    }, options);
    const interpretId: unknown = (data as ITestResponse).interpret_id;
    if (interpretId === undefined || interpretId === null) {
        throw new Error("LeetCode did not return an interpret id.");
    }
    return mapTestRun(await pollResult(request, String(interpretId), target.slug, options), testInput);
}
