// Licensed under the MIT license.

import type { Memento } from "vscode";

const TestCaseKey = "leetcode-test-case";

/** The input each problem was last tested with. It belongs to no account, so it outlives sign-out and site changes. */
class TestCaseStore {
    private storage: Memento | undefined;

    public initialize(storage: Memento): void {
        this.storage = storage;
    }

    public async save(slug: string, input: string): Promise<void> {
        await this.storage?.update(`${TestCaseKey}:${slug}`, input);
    }

    public get(slug: string): string | undefined {
        return this.storage?.get<string>(`${TestCaseKey}:${slug}`);
    }
}

export const testCaseStore: TestCaseStore = new TestCaseStore();
