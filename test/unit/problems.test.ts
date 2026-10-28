import { strict as assert } from "node:assert";
import { test, beforeEach, after } from "node:test";
import axios from "axios";
import Module = require("node:module");

let endpoint = "leetcode";
let cookie = "account-a";
let translated = true;
let hideSolved = false;
const moduleLoader: any = Module;
const originalLoad = moduleLoader._load;
moduleLoader._load = function (request: string, parent: unknown, isMain: boolean): unknown {
    if (request === "../commands/plugin") { return { getSortingStrategy: () => "None" }; }
    if (request === "vscode") {
        return {
            env: { appName: "Visual Studio Code", uriScheme: "vscode", appRoot: process.cwd() },
            workspace: {
                getConfiguration: () => ({
                    get: (key: string, defaultValue: unknown) => {
                        if (key === "endpoint") return endpoint;
                        if (key === "useEndpointTranslation") return translated;
                        if (key === "hideSolved") return hideSolved;
                        return defaultValue;
                    },
                }),
                onDidChangeConfiguration: () => ({ dispose: () => undefined }),
            },
            Uri: { file: (value: string) => ({ fsPath: value, toString: () => value }) },
            window: {
                createOutputChannel: () => ({
                    append: () => undefined,
                    appendLine: () => undefined,
                    dispose: () => undefined,
                    show: () => undefined,
                }),
            },
            l10n: { t: (value: string) => value },
        };
    }
    return originalLoad.call(this, request, parent, isMain);
};


const api: typeof import("../../src/api/problems") = require("../../src/api/problems");
const { problemCache }: typeof import("../../src/api/problemCache") = require("../../src/api/problemCache");
const { globalState } = require("../../src/globalState");
const { explorerNodeManager: explorer } = require("../../src/explorer/explorerNodeManager");
const { SortingStrategy, ProblemState } = require("../../src/shared");
globalState.getCookie = () => cookie;
moduleLoader._load = originalLoad;
const originalAdapter = axios.defaults.adapter;
const disk = new Map<string, unknown>();
problemCache.initialize({ get: (key: string) => structuredClone(disk.get(key)),
    update: async (key: string, value: unknown) => { disk.set(key, structuredClone(value)); }, keys: () => [...disk.keys()] } as any);
let calls: Array<{ query: string; variables: any; url: string; cookie: string }> = [];
let fail = false;
let gate: Promise<void> | undefined;
function question(id: string) {
    return { questionFrontendId: id, title: 'Problem ' + id, translatedTitle: '题目 ' + id, titleSlug: 'problem-' + id.replace(/ /g, '-'),
        difficulty: 'EASY', status: 'TO_DO', acRate: 0.5, topicTags: [] };
}

beforeEach(async () => {
    endpoint = 'leetcode'; cookie = 'account-a'; translated = true; hideSolved = false;
    calls = []; fail = false; gate = undefined; explorer.dispose(); await problemCache.clear();
    axios.defaults.adapter = async (config: any) => {
        const payload = JSON.parse(config.data);
        calls.push({ ...payload, url: config.url, cookie: config.headers.cookie });
        if (gate) { await gate; }
        if (fail) { const error: any = new Error('offline'); error.response = { status: 400, headers: {} }; throw error; }
        let data: unknown;
        if (payload.query.includes('problemsetQuestionListV2')) {
            const { skip = 0, limit = 50, searchKeyword = '' } = payload.variables;
            const questions = searchKeyword ? [question('999'), question(searchKeyword)]
                : Array.from({length: Math.min(limit, 125 - skip)}, (_, i) => question(String(skip + i + 1)));
            data = { problemsetQuestionListV2: { questions, totalLength: searchKeyword ? 2 : 125 } };
        } else if (payload.query.includes('problemMetadata')) {
            data = { question: { ...question('42'), questionId: '123', titleSlug: payload.variables.titleSlug,
                acRate: endpoint === 'leetcode' ? 50 : 0.5, extra: { topCompanyTags: [{name: '谷歌', slug: 'google'}] } } };
        } else if (payload.query.includes('questionTopicTags')) {
            data = { questionTopicTags: { edges: [{ node: { name: 'Array', slug: 'array', translatedName: '数组' } }] } };
        } else { throw new Error('Unexpected API: ' + payload.query); }
        return { data: { data }, status: 200, statusText: 'OK', headers: {}, config };
    };
});
after(() => { axios.defaults.adapter = originalAdapter; });

test('one page loads once, next page uses offset, and disk cache survives reset', async () => {
    const first = await api.getProblemPage();
    assert.equal(calls.length, 1); assert.equal(first.problems.length, 50); assert.equal(first.next, 50); assert.equal(first.hasMore, true);
    const second = await api.getProblemPage({skip:first.next});
    assert.equal(second.problems[0].id, '51'); assert.equal(calls.length, 2);
    api.invalidateProblemCache();
    fail = true;
    assert.equal((await api.getProblemPage()).problems[0].id, '1'); assert.equal(calls.length, 2);
    fail = false;
    assert.equal((await api.getProblemPage({skip:100})).hasMore, false);
});

test('filters, pagination, sorting, and translations are sent to both endpoints', async () => {
    for (const site of ['leetcode', 'leetcode-cn']) {
        endpoint = site;
        await api.getProblemPage({difficulty:'Easy',tag:'array',company:'google',hideSolved:true,sort:SortingStrategy.AcceptanceRateDesc});
        const request = calls.at(-1)!;
        assert.deepEqual(request.variables.filters, {filterCombineType:'ALL',
            difficultyFilter:{difficulties:['EASY'],operator:'IS'},
            topicFilter:{topicSlugs:['array'],operator:'IS'},
            companyFilter:{companySlugs:['google'],operator:'IS'},
            statusFilter:{questionStatuses:['SOLVED'],operator:'IS_NOT'}});
        assert.deepEqual(request.variables.sortBy, {sortField:'AC_RATE',sortOrder:'DESCENDING'});
        assert.equal(request.query.includes('translatedTitle'), site === 'leetcode-cn');
    }
});

test('account, endpoint and language changes use isolated cache entries with no credentials on disk', async () => {
    await api.getProblemPage(); cookie = 'account-b'; await api.getProblemPage(); endpoint = 'leetcode-cn'; await api.getProblemPage(); translated = false; await api.getProblemPage();
    assert.equal(calls.length, 4);
    const saved = JSON.stringify([...disk]); assert.equal(saved.includes('account-a'), false); assert.equal(saved.includes('account-b'), false);
    cookie = 'account-a'; endpoint = 'leetcode'; translated = true;
    await api.getProblemPage(); assert.equal(calls.length, 4);
});

test('single id lookup searches one bounded page, requires an exact match and reuses cached metadata', async () => {
    const problem = await api.getProblemById('LCR 123');
    assert.equal(problem?.id, 'LCR 123'); assert.equal(calls.length, 1); assert.equal(calls[0].variables.searchKeyword, 'LCR 123');
    assert.equal(calls[0].variables.limit, 100);
    await api.getProblemById('LCR 123'); assert.equal(calls.length, 1);
    const detail = await api.getProblemBySlug('some-problem');
    assert.equal(detail?.questionId, '123'); assert.equal(detail?.passRate, '50.0 %');
    await api.getProblemById('42'); assert.equal(calls.length, 2);
});

test('submission updates only local status and preserves previously accepted state', async () => {
    const page = await api.getProblemPage();
    await api.recordSubmission(page.problems[0], true);
    await api.recordSubmission(page.problems[0], false);
    await api.updateCachedFavorite('1', true);
    assert.equal(calls.length, 1);
    api.invalidateProblemCache();
    const cached = (await api.getProblemPage()).problems[0];
    assert.equal(cached.state, ProblemState.AC); assert.equal(cached.isFavorite, true);
});

test('root refresh makes no requests; expanding and loading more each fetch just one page', async () => {
    await explorer.refreshCache(); assert.equal(explorer.getRootNodes().length, 7); assert.equal(calls.length, 0);
    let nodes = await explorer.getChildren('All'); assert.equal(calls.length, 1); assert.equal(nodes.length, 51);
    await Promise.all([explorer.loadMore('All'), explorer.loadMore('All')]);
    nodes = await explorer.getChildren('All'); assert.equal(calls.length, 2); assert.equal(nodes.length, 101);
    await explorer.loadMore('All'); nodes = await explorer.getChildren('All');
    assert.equal(calls.length, 3); assert.equal(nodes.length, 125); assert.ok(nodes.every((node: any) => node.isProblem));
});

test('failed refresh retains existing rows and shows a retry action', async () => {
    await explorer.getChildren('All'); fail = true;
    await explorer.refreshCache(true);
    const failed = await explorer.getChildren('All');
    assert.equal(failed.length, 51); assert.equal(failed.at(-1).action.kind, 'retry');
    fail = false; await explorer.retry('All');
    const retried = await explorer.getChildren('All'); assert.equal(retried.at(-1).action.kind, 'more');
});

test('changing account during an outstanding tree request cannot populate the new tree', async () => {
    let release!: () => void; gate = new Promise<void>((resolve) => { release = resolve; });
    const old = explorer.getChildren('All');
    cookie = 'account-b'; await explorer.refreshCache(); release(); await old; gate = undefined;
    const nodes = await explorer.getChildren('All');
    assert.equal(nodes[0].id, '1'); assert.equal(calls.length, 2); assert.equal(calls[1].cookie, 'account-b');
});

test('tag navigation loads catalog metadata without reading question pages', async () => {
    const tags = await explorer.getChildren('Tag'); assert.equal(tags[0].id, 'Tag.array');
    assert.equal(calls.length, 1); assert.ok(calls[0].query.includes('questionTopicTags'));
    await explorer.getChildren('Tag.array'); assert.equal(calls.length, 2); assert.equal(calls[1].variables.filters.topicFilter.topicSlugs[0], 'array');
});


test('failed load-more retries the missing page without discarding earlier pages', async () => {
    await explorer.getChildren('All'); fail = true;
    await explorer.loadMore('All');
    let nodes = await explorer.getChildren('All'); assert.equal(nodes.length, 51); assert.equal(nodes.at(-1).action.kind, 'retry');
    fail = false; await explorer.retry('All');
    nodes = await explorer.getChildren('All'); assert.equal(nodes.length, 101);
    assert.deepEqual(calls.map((call) => call.variables.skip), [0, 50, 50]);
});

test('failed catalog refresh preserves previous categories', async () => {
    await explorer.getChildren('Tag'); await explorer.refreshCache(true); fail = true;
    const nodes = await explorer.getChildren('Tag'); assert.equal(nodes[0].id, 'Tag.array'); assert.equal(nodes.at(-1).action.kind, 'retry');
});
