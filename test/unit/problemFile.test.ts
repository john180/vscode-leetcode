import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { IProblem } from "../../src/shared";
import { buildProblemFile, htmlToPlainText } from "../../src/api/problemFile";
import type { IQuestionDetail } from "../../src/api/question";

const problem: IProblem = {
    id: "1",
    slug: "two-sum",
    name: "Two Sum",
    difficulty: "Easy",
    passRate: "50.0 %",
    state: 1 as IProblem["state"],
    locked: false,
    isFavorite: false,
    companies: [],
    tags: [],
};

const detail: IQuestionDetail = {
    questionId: "1",
    questionFrontendId: "1",
    title: "Two Sum",
    translatedTitle: "Two Sum",
    titleSlug: "two-sum",
    difficulty: "Easy",
    isPaidOnly: false,
    content: "<p>Find two numbers.</p>",
    translatedContent: "<p>Find two numbers.</p>",
    codeSnippets: [{ lang: "C++", langSlug: "cpp", code: "class Solution {};" }],
    topicTags: [],
};

test("buildProblemFile keeps the @lc contract", () => {
    const file = buildProblemFile({
        detail,
        problem,
        language: "cpp",
        includeDescription: true,
        useTranslation: true,
        endpoint: "leetcode.cn",
    });

    assert.match(file, /^\/\/ @lc app=leetcode\.cn id=1 lang=cpp/m);
    assert.match(file, /^\/\/ @lc code=begin$/m);
    assert.match(file, /^\/\/ @lc code=end$/m);
    assert.match(file, /class Solution \{\};/);
    assert.match(file, /Find two numbers\./);
    assert.doesNotMatch(file, /<p>/);
});

test("buildProblemFile uses comment syntax per language", () => {
    const python = buildProblemFile({
        detail: { ...detail, codeSnippets: [{ lang: "Python3", langSlug: "python3", code: "class Solution:" }] },
        problem,
        language: "python3",
        includeDescription: false,
        useTranslation: true,
        endpoint: "leetcode.cn",
    });
    assert.match(python, /^# @lc app=leetcode\.cn id=1 lang=python3/m);
    assert.match(python, /^# @lc code=begin$/m);
});

test("htmlToPlainText decodes entities", () => {
    assert.equal(htmlToPlainText("<p>a &amp; b</p>"), "a & b");
});

test("buildProblemFile uses hash comments for shell-like languages", () => {
    const bash = buildProblemFile({
        detail: { ...detail, codeSnippets: [{ lang: "Bash", langSlug: "bash", code: "echo hi" }] },
        problem,
        language: "bash",
        includeDescription: false,
        useTranslation: true,
        endpoint: "leetcode.cn",
    });
    assert.match(bash, /^# @lc app=leetcode\.cn id=1 lang=bash/m);
    assert.match(bash, /^# @lc code=begin$/m);
    assert.match(bash, /^echo hi$/m);
});

test("buildProblemFile uses SQL comments for mysql", () => {
    const mysql = buildProblemFile({
        detail: { ...detail, codeSnippets: [{ lang: "MySQL", langSlug: "mysql", code: "SELECT 1;" }] },
        problem,
        language: "mysql",
        includeDescription: false,
        useTranslation: true,
        endpoint: "leetcode.com",
    });
    assert.match(mysql, /^-- @lc app=leetcode\.com id=1 lang=mysql/m);
    assert.match(mysql, /^-- @lc code=begin$/m);
    assert.match(mysql, /^SELECT 1;$/m);
});

test("buildProblemFile falls back to C-style comments for unknown languages", () => {
    const java = buildProblemFile({
        detail: { ...detail, codeSnippets: [] },
        problem,
        language: "java",
        includeDescription: false,
        useTranslation: true,
        endpoint: "leetcode.com",
    });
    assert.match(java, /^\/\/ @lc app=leetcode\.com id=1 lang=java/m);
    assert.match(java, /^\/\/ @lc code=begin$/m);
    assert.match(java, /^\/\/ @lc code=end$/m);
    assert.doesNotMatch(java, /class Solution/);
});

test("buildProblemFile falls back to the problem id when detail has no frontend id", () => {
    const file = buildProblemFile({
        detail: { ...detail, questionFrontendId: "", codeSnippets: [] },
        problem,
        language: "cpp",
        includeDescription: false,
        useTranslation: true,
        endpoint: "leetcode.com",
    });
    assert.match(file, /^\/\/ @lc app=leetcode\.com id=1 lang=cpp/m);
});
