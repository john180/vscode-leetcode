#!/usr/bin/env node
// P0 smoke test for leetcode.cn APIs.
//
// Reads a cookie from LC_COOKIE_FILE (or the OS temp directory), never prints
// or writes the cookie value, and refuses to read a file from inside this repo.
//
// Usage:
//   LC_COOKIE_FILE=D:\Codes\_scratch\lc-cookie\cookie.txt node scripts/smoke.mjs

import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COOKIE_PATH = resolve(
  process.env.LC_COOKIE_FILE || join(os.tmpdir(), "lc-cookie", "cookie.txt"),
);
const ENDPOINT = "https://leetcode.cn/graphql/";
const REFERER = "https://leetcode.cn/problemset/";
const TIMEOUT_MS = 20000;

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function realPathOrFail(file) {
  try {
    return realpathSync(file);
  } catch {
    fail(`cookie file not found: ${file}`);
  }
}

const cookieReal = realPathOrFail(COOKIE_PATH);
const repoReal = realpathSync(REPO_ROOT);
if (cookieReal === repoReal || cookieReal.startsWith(repoReal + sep)) {
  fail("refusing to read a cookie file from inside the repository");
}
if (!statSync(cookieReal).isFile()) {
  fail("cookie path is not a regular file");
}

function parseCookie(raw) {
  let text = raw.replace(/\r?\n/g, " ").trim();
  if (/^cookie\s*:/i.test(text)) {
    text = text.replace(/^cookie\s*:/i, "").trim();
  }
  const pairs = new Map();
  for (const part of text.split(";")) {
    const item = part.trim();
    const eq = item.indexOf("=");
    if (eq <= 0) continue;
    const name = item.slice(0, eq).trim();
    const value = item.slice(eq + 1).trim();
    if (name && value) pairs.set(name, value);
  }
  return pairs;
}

const cookies = parseCookie(readFileSync(cookieReal, "utf8"));
const session = cookies.get("LEETCODE_SESSION");
const csrf = cookies.get("csrftoken");
if (!session) fail("cookie is missing LEETCODE_SESSION");
if (!csrf) fail("cookie is missing csrftoken");

const cookieHeader = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
console.log(`[ok] cookie loaded from ${cookieReal} (${cookies.size} names)`);

const mask = (value) =>
  !value ? "(none)" : value.length <= 2 ? "*".repeat(value.length) : `${value.slice(0, 2)}${"*".repeat(Math.min(6, value.length - 2))}`;

async function gql(label, query, variables = {}) {
  const started = Date.now();
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        cookie: cookieHeader,
        "x-csrftoken": csrf,
        referer: REFERER,
        origin: "https://leetcode.cn",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) vscode-leetcode-smoke/0.1",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`${label}: request failed (${error.name})`);
  }

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${label}: non-JSON response (HTTP ${response.status})`);
  }
  if (!response.ok || body.errors) {
    const details = (body.errors || []).map((e) => e.message).join("; ");
    throw new Error(
      `${label}: HTTP ${response.status}${details ? ` - ${details}` : ""}`,
    );
  }
  console.log(`[ok] ${label} (${Date.now() - started} ms)`);
  return body.data;
}

const USER_QUERY = `query { userStatus { username isSignedIn isPremium } }`;

const LIST_QUERY = `
query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
  problemsetQuestionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
    total
    questions { frontendQuestionId titleCn titleSlug difficulty paidOnly status }
  }
}`;

const DETAIL_QUERY = `
query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionId
    questionFrontendId
    title
    translatedTitle
    difficulty
    translatedContent
    content
    codeSnippets { langSlug }
  }
}`;

const FAVORITE_QUERY = `
query favoriteQuestions($favoriteSlug: String!) {
  favoriteQuestionList(favoriteSlug: $favoriteSlug, limit: 5) {
    questions { titleSlug }
  }
}`;

let failures = 0;
const check = async (label, fn) => {
  try {
    await fn();
  } catch (error) {
    failures += 1;
    console.error(`[FAIL] ${error.message}`);
  }
};

let signedIn = false;
await check("userStatus", async () => {
  const data = await gql("userStatus", USER_QUERY);
  const status = data.userStatus;
  signedIn = Boolean(status.isSignedIn);
  console.log(
    `       signedIn=${status.isSignedIn} premium=${status.isPremium} user=${mask(status.username)}`,
  );
  if (!status.isSignedIn) {
    throw new Error("cookie is not signed in (expired or wrong endpoint)");
  }
});

await check("problem list", async () => {
  const data = await gql("problemsetQuestionList", LIST_QUERY, {
    categorySlug: "",
    limit: 5,
    skip: 0,
    filters: {},
  });
  const page = data.problemsetQuestionList;
  console.log(`       total=${page.total}`);
  for (const q of page.questions) {
    console.log(
      `       ${q.frontendQuestionId} | ${q.titleCn} | ${q.difficulty} | ${q.status} | paid=${q.paidOnly}`,
    );
  }
  if (!page.total) throw new Error("problem list is empty");
});

await check("question detail", async () => {
  const data = await gql("questionData(two-sum)", DETAIL_QUERY, {
    titleSlug: "two-sum",
  });
  const q = data.question;
  console.log(
    `       ${q.questionFrontendId} | ${q.translatedTitle} | snippets=${q.codeSnippets.length} | zh=${Boolean(q.translatedContent)}`,
  );
  if (!q.codeSnippets?.length) throw new Error("no code snippets returned");
});

await check("LCP question detail", async () => {
  const data = await gql("questionData(na-ying-bi)", DETAIL_QUERY, {
    titleSlug: "na-ying-bi",
  });
  const q = data.question;
  console.log(
    `       frontendId="${q.questionFrontendId}" internalId=${q.questionId}`,
  );
});

await check("favorites", async () => {
  const data = await gql("favoriteQuestionList", FAVORITE_QUERY, {
    favoriteSlug: "Favorite",
  });
  const questions = data.favoriteQuestionList?.questions || [];
  console.log(`       count=${questions.length}`);
});

if (!signedIn) {
  console.error("[FAIL] smoke test finished without a signed-in session");
  process.exit(1);
}
if (failures > 0) {
  console.error(`[FAIL] smoke test finished with ${failures} failure(s)`);
  process.exit(1);
}
console.log("[ok] smoke test passed");
