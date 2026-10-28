// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { EventEmitter } from "node:events";
import type { Memento } from "vscode";

interface IEntry { at: number; value: unknown; }
const STORAGE_KEY = "leetcode.problemCache.v1";
const TTL = 5 * 60 * 1000;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 300;

/** Bounded disk cache. Credentials never belong in keys or values. */
export class ProblemCache {
    public readonly events = new EventEmitter();
    private entries = new Map<string, IEntry>();
    private pending = new Map<string, Promise<unknown>>();
    private generation = 0;
    private storage: Memento | undefined;
    private writes: Promise<void> = Promise.resolve();

    public initialize(storage: Memento): void {
        this.storage = storage;
        this.reset();
    }

    public reset(): void {
        this.generation++;
        this.pending.clear();
        this.entries.clear();
        const saved = this.storage?.get<Record<string, IEntry>>(STORAGE_KEY);
        if (saved && typeof saved === "object" && !Array.isArray(saved)) {
            for (const [key, entry] of Object.entries(saved).slice(-MAX_ENTRIES)) {
                if (entry && typeof entry.at === "number" && Date.now() - entry.at < MAX_AGE && entry.value !== undefined) {
                    this.entries.set(key, entry);
                }
            }
        }
    }

    public async clear(): Promise<void> {
        this.generation++;
        this.pending.clear();
        this.entries.clear();
        await this.persist();
        this.events.emit("cleared");
    }

    public values<T>(prefix: string): T[] {
        return [...this.entries].filter(([key, entry]) => key.startsWith(prefix) && Date.now() - entry.at < MAX_AGE).map(([, entry]) => entry.value as T);
    }

    public async remove(prefix: string): Promise<void> {
        this.generation++;
        this.pending.clear();
        for (const key of this.entries.keys()) {
            if (key.startsWith(prefix)) { this.entries.delete(key); }
        }
        await this.persist();
        this.events.emit("updated", prefix);
    }

    public async get<T>(key: string, loader: () => Promise<T>, force: boolean = false): Promise<T> {
        const cached = this.entries.get(key);
        if (!force && cached && Date.now() - cached.at < MAX_AGE) {
            if (Date.now() - cached.at >= TTL) {
                void this.load(key, loader).catch(() => undefined);
            }
            return cached.value as T;
        }
        return this.load(key, loader);
    }

    private load<T>(key: string, loader: () => Promise<T>): Promise<T> {
        const pending = this.pending.get(key);
        if (pending) { return pending as Promise<T>; }
        const generation = this.generation;
        const task = loader().then(async (value) => {
            if (generation === this.generation) {
                this.entries.delete(key);
                this.entries.set(key, { at: Date.now(), value });
                while (this.entries.size > MAX_ENTRIES) {
                    this.entries.delete(this.entries.keys().next().value!);
                }
                await this.persist();
                this.events.emit("updated", key);
            }
            return value;
        }).finally(() => {
            if (this.pending.get(key) === task) { this.pending.delete(key); }
        });
        this.pending.set(key, task);
        return task;
    }

    public async update<T>(prefix: string, change: (value: T) => void): Promise<void> {
        // An older request must not overwrite a local status/favorite change.
        this.generation++;
        this.pending.clear();
        for (const [key, entry] of this.entries) {
            if (key.startsWith(prefix)) { change(entry.value as T); }
        }
        await this.persist();
        this.events.emit("updated", prefix);
    }

    private persist(): Promise<void> {
        const snapshot = JSON.parse(JSON.stringify(Object.fromEntries(this.entries)));
        this.writes = this.writes.then(async () => {
            await this.storage?.update(STORAGE_KEY, snapshot);
        }).catch(() => {
            // A disk failure must not fail an otherwise successful network request.
        });
        return this.writes;
    }
}

export const problemCache = new ProblemCache();
