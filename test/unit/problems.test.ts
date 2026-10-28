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
                    info: () => undefined,
                    warn: () => undefined,
                    error: () => undefined,
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
const favorites = { favorites: { leetcode_favorites: [{ id_hash: 'hot', name: 'LeetCode Hot 100', questions: [
    { id: 1, title: 'Two Sum', title_slug: 'two-sum' },
    { id: 2, title: 'Add Two Numbers', title_slug: 'add-two-numbers' },
    { id: 3, title: 'Longest Substring', title_slug: 'longest-substring' },
] }] } };

beforeEach(async () => {
    endpoint = 'leetcode'; cookie = 'account-a'; translated = true; hideSolved = false;
    calls = []; fail = false; gate = undefined; explorer.setSearch(''); explorer.dispose(); await problemCache.clear();
    axios.defaults.adapter = async (config: any) => {
        if (config.url.endsWith('/list/api/questions')) {
            calls.push({ query: 'favorites', variables: {}, url: config.url, cookie: config.headers.cookie });
            return { data: favorites, status: 200, statusText: 'OK', headers: {}, config };
        }
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
            data = Object.fromEntries(Object.entries(payload.variables).map(([name, slug]) => [`q${name.slice(1)}`,
                { ...question('42'), questionId: '123', titleSlug: slug,
                    acRate: endpoint === 'leetcode' ? 50 : 0.5, extra: { topCompanyTags: [{name: '谷歌', slug: 'google'}] } }]));
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
    await problemCache.flush();
    const saved = JSON.stringify([...disk]); assert.equal(saved.includes('account-a'), false); assert.equal(saved.includes('account-b'), false);
    cookie = 'account-a'; endpoint = 'leetcode'; translated = true;
    await api.getProblemPage(); assert.equal(calls.length, 4);
});

test('single id lookup searches one bounded page, requires an exact match and reuses cached metadata', async () => {
    const problem = await api.getProblemById('LCR 123');
    assert.equal(problem?.id, 'LCR 123'); assert.equal(calls.length, 1); assert.equal(calls[0].variables.searchKeyword, 'LCR 123');
    assert.equal(calls[0].variables.limit, 100);
    await api.getProblemById('LCR 123'); assert.equal(calls.length, 1);
    await problemCache.flush();
    assert.equal(JSON.stringify([...disk]).includes('LCR 123'), false, 'id lookups are not written to disk');
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

test('searching filters list pages in memory and clearing restores the pages already browsed', async () => {
    await explorer.getChildren('All'); await explorer.loadMore('All');
    assert.equal((await explorer.getChildren('All')).length, 101); assert.equal(calls.length, 2);
    assert.equal(explorer.setSearch(' two '), true); assert.equal(explorer.setSearch('two'), false);
    const matches = await explorer.getChildren('All');
    assert.equal(calls.length, 3); assert.equal(calls[2].variables.searchKeyword, 'two'); assert.equal(calls[2].variables.skip, 0);
    assert.deepEqual(matches.map((node: any) => node.treeId), ['All/999', 'All/two']);
    assert.equal(explorer.getTotal('All'), 2);
    await problemCache.flush();
    assert.equal(JSON.stringify([...disk]).includes('two'), false, 'search results are not written to disk');
    explorer.setSearch('');
    assert.equal((await explorer.getChildren('All')).length, 101); assert.equal(calls.length, 3);
});

test('search results carry category-scoped ids and resolve their parents up to the root', async () => {
    explorer.setSearch('two');
    const [problem] = await explorer.getChildren('Tag.array');
    assert.equal(problem.treeId, 'Tag.array/999');
    assert.equal(calls.at(-1)!.variables.filters.topicFilter.topicSlugs[0], 'array');
    const tag = explorer.getParent(problem); assert.equal(tag.id, 'Tag.array');
    const root = explorer.getParent(tag); assert.equal(root.id, 'Tag'); assert.equal(root.name, 'Tag');
    assert.equal(explorer.getParent(root), undefined);
});

test('favorite lists are searched locally by title and by names of problems seen before', async () => {
    const metadata = () => calls.filter((call) => call.query.includes('problemMetadata')).map((call) => Object.values(call.variables));
    explorer.setSearch('two');
    await explorer.getChildren('Hot100');
    assert.deepEqual(metadata(), [['two-sum', 'add-two-numbers']], 'one request for the page'); assert.equal(explorer.getTotal('Hot100'), 2);
    // Both visited problems are now cached under the translated name "题目 42".
    explorer.setSearch('题目 42');
    await explorer.getChildren('Hot100'); assert.equal(explorer.getTotal('Hot100'), 2);
    explorer.setSearch('zzz');
    assert.deepEqual((await explorer.getChildren('Hot100')).map((node: any) => node.action?.kind), ['empty']);
});

test('problem lookups made together share requests of at most 20 problems', async () => {
    const slugs = Array.from({length: 25}, (_, i) => `problem-${i}`);
    const problems = await Promise.all(slugs.map((slug) => api.getProblemBySlug(slug)));
    assert.deepEqual(problems.map((problem) => problem?.slug), slugs);
    assert.deepEqual(calls.map((call) => Object.keys(call.variables).length), [20, 5]);
    await Promise.all([api.getProblemBySlug('problem-0'), api.getProblemBySlug('problem-25')]);
    assert.deepEqual(calls.at(-1)!.variables, {s0: 'problem-25'}, 'cached problems are not asked for again');
});

test('switching the account aborts what is still loading for the old one', async () => {
    let release!: () => void; gate = new Promise<void>((resolve) => { release = resolve; });
    const loading = api.getProblemPage();
    const aborted = assert.rejects(loading, (error: unknown) => axios.isCancel(error));
    cookie = 'account-b'; api.getProblemCacheScope(); release();
    await aborted;
    gate = undefined;
    assert.equal((await api.getProblemPage()).problems.length, 50, 'the new account loads normally');
});

test('favorite lists are cached once for the tree and the commands, and a favorite change drops them', async () => {
    const favoriteRequests = () => calls.filter((call) => call.query === 'favorites').length;
    const first = await api.getFavoriteData(); await api.getFavoriteData();
    assert.equal(favoriteRequests(), 1); assert.equal(first.hot100?.questions.length, 3);
    await api.updateCachedFavorite('1', true);
    await api.getFavoriteData();
    assert.equal(favoriteRequests(), 2);
});

test('matches follow the expanded categories in tree order', async () => {
    explorer.setSearch('two');
    await explorer.getChildren('All'); await explorer.getChildren('Difficulty'); await explorer.getChildren('Difficulty.Easy');
    const ids = () => explorer.getMatches().map((node: any) => node.treeId);
    assert.deepEqual(ids(), ['All/999', 'All/two', 'Difficulty.Easy/999', 'Difficulty.Easy/two']);
    explorer.collapse('All'); assert.deepEqual(ids(), ['Difficulty.Easy/999', 'Difficulty.Easy/two']);
    explorer.collapse('Difficulty'); assert.deepEqual(ids(), []);
    explorer.expand('Difficulty'); assert.equal(ids().length, 2);
});
