// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { EventEmitter } from "node:events";
import type { Memento } from "vscode";

interface IEntry { at: number; value: unknown; transient?: boolean; }
const STORAGE_KEY = "leetcode.problemCache.v1";
const TTL = 5 * 60 * 1000;
const MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 300;
const PERSIST_DELAY = 1000;

/** Bounded disk cache. Credentials never belong in keys or values. */
export class ProblemCache {
    public readonly events = new EventEmitter();
    private entries = new Map<string, IEntry>();
    private pending = new Map<string, Promise<unknown>>();
    private generation = 0;
    private storage: Memento | undefined;
    private writes: Promise<void> = Promise.resolve();
    private persistTimer: ReturnType<typeof setTimeout> | undefined;

    public initialize(storage: Memento): void {
        this.storage = storage;
        this.generation++;
        this.pending.clear();
        this.entries.clear();
        const saved = storage.get<Record<string, IEntry>>(STORAGE_KEY);
        if (saved && typeof saved === "object" && !Array.isArray(saved)) {
            for (const [key, entry] of Object.entries(saved).slice(-MAX_ENTRIES)) {
                if (entry && typeof entry.at === "number" && Date.now() - entry.at < MAX_AGE && entry.value !== undefined) {
                    this.entries.set(key, { at: entry.at, value: entry.value });
                }
            }
        }
    }

    /** Drops in-flight requests and memory-only results; persisted entries stay usable. */
    public reset(): void {
        this.generation++;
        this.pending.clear();
        for (const [key, entry] of this.entries) {
            if (entry.transient || Date.now() - entry.at >= MAX_AGE) { this.entries.delete(key); }
        }
    }

    public async clear(): Promise<void> {
        this.generation++;
        this.pending.clear();
        this.entries.clear();
        await this.flush();
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
        await this.flush();
        this.events.emit("updated", prefix);
    }

    /** `persist: false` keeps one-off results (searches, random picks) out of storage and the tree. */
    public async get<T>(key: string, loader: () => Promise<T>, force: boolean = false, persist: boolean = true): Promise<T> {
        const cached = this.entries.get(key);
        if (!force && cached && Date.now() - cached.at < MAX_AGE) {
            if (Date.now() - cached.at >= TTL) {
                void this.load(key, loader, persist).catch(() => undefined);
            }
            return cached.value as T;
        }
        return this.load(key, loader, persist);
    }

    private load<T>(key: string, loader: () => Promise<T>, persist: boolean): Promise<T> {
        const pending = this.pending.get(key);
        if (pending) { return pending as Promise<T>; }
        const generation = this.generation;
        const task = loader().then((value) => {
            if (generation === this.generation) {
                // Once an entry is worth persisting it stays persisted.
                const transient = !persist && (this.entries.get(key)?.transient ?? true);
                this.entries.delete(key);
                this.entries.set(key, { at: Date.now(), value, transient: transient || undefined });
                this.evict();
                if (!transient) {
                    this.schedulePersist();
                    this.events.emit("updated", key);
                }
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
        await this.flush();
        this.events.emit("updated", prefix);
    }

    /** Writes pending changes now; loads only schedule a coalesced write. */
    public flush(): Promise<void> {
        if (this.persistTimer) {
            clearTimeout(this.persistTimer);
            this.persistTimer = undefined;
        }
        const persisted = [...this.entries].filter(([, entry]) => !entry.transient);
        const snapshot = JSON.parse(JSON.stringify(Object.fromEntries(persisted)));
        this.writes = this.writes.then(async () => {
            await this.storage?.update(STORAGE_KEY, snapshot);
        }).catch(() => {
            // A disk failure must not fail an otherwise successful network request.
        });
        return this.writes;
    }

    private schedulePersist(): void {
        if (this.persistTimer) { return; }
        this.persistTimer = setTimeout(() => {
            this.persistTimer = undefined;
            void this.flush();
        }, PERSIST_DELAY);
        this.persistTimer.unref?.();
    }

    private evict(): void {
        while (this.entries.size > MAX_ENTRIES) {
            // Memory-only results go first so searches cannot push out browsed pages.
            const transient = [...this.entries].find(([, entry]) => entry.transient)?.[0];
            this.entries.delete(transient ?? this.entries.keys().next().value!);
        }
    }
}

export const problemCache = new ProblemCache();
