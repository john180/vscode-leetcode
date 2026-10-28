/** A search typed into the problem list. `tag:`/`company:` pin the category to search in. */
export interface IProblemSearch {
    text: string;
    keyword: string;
    terms: string[];
    tag?: string;
    company?: string;
}

export function parseProblemSearch(text: string): IProblemSearch | undefined {
    const search: IProblemSearch = { text: text.trim(), keyword: "", terms: [] };
    if (!search.text) {
        return undefined;
    }
    search.keyword = search.text.replace(/(?:^|\s)(tag|company):([\w-]+)/g, (_match, kind: "tag" | "company", slug: string) => {
        search[kind] = slug.toLowerCase();
        return " ";
    }).trim().replace(/\s+/g, " ");
    search.terms = search.keyword ? search.keyword.toLowerCase().split(" ") : [];
    return search;
}

export function matchesTerms(text: string, terms: string[]): boolean {
    const lower: string = text.toLowerCase();
    return terms.every((term: string) => lower.includes(term));
}

/** Non-overlapping [start, end) ranges of every term in the label, for `TreeItemLabel.highlights`. */
export function highlightRanges(label: string, terms: string[]): Array<[number, number]> {
    const lower: string = label.toLowerCase();
    const ranges: Array<[number, number]> = [];
    for (const term of terms) {
        for (let start = lower.indexOf(term); start >= 0 && term; start = lower.indexOf(term, start + term.length)) {
            ranges.push([start, Math.min(label.length, start + term.length)]);
        }
    }
    ranges.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const range of ranges) {
        const last = merged.at(-1);
        if (last && range[0] <= last[1]) {
            last[1] = Math.max(last[1], range[1]);
        } else {
            merged.push(range);
        }
    }
    return merged;
}
