// Licensed under the MIT license.

import type { UserDataType } from "../globalState";
import { Endpoint } from "../site";

/** The credential in effect on the selected site. Another cookie or site starts another session. */
export interface ISession {
    readonly site: Endpoint;
    readonly cookie?: string;
    /** The saved account holding the cookie. Naming the cookie's account keeps the session. */
    readonly profile?: string;
    readonly user?: UserDataType;
    /** Aborted when the session ends, which stops every request made with it. */
    readonly signal: AbortSignal;
}

/** An attempt to change the session. It may change it only while no later operation has begun. */
export interface IOperation {
    /** Aborted once a later operation begins, which stops this one's checks with LeetCode. */
    readonly signal: AbortSignal;
    isCurrent(): boolean;
}

/**
 * Owns the session, and orders the operations that change it: each one supersedes those before it, so
 * whatever an earlier one still awaits from LeetCode or storage cannot bring back what a later one replaced.
 */
export class SessionController {
    private ending = new AbortController();
    private session: ISession = { site: Endpoint.LeetCode, signal: this.ending.signal };
    private superseding = new AbortController();
    private operation: IOperation = this.newOperation();
    private writes: Promise<void> = Promise.resolve();

    public current(): ISession {
        return this.session;
    }

    /** Starts an operation that supersedes every earlier one. */
    public begin(): IOperation {
        this.superseding.abort();
        this.superseding = new AbortController();
        this.operation = this.newOperation();
        return this.operation;
    }

    /** The latest operation, for work that has to stop once another begins but must not supersede anything itself. */
    public latest(): IOperation {
        return this.operation;
    }

    /** Ends the session at once, leaving `site` selected with no credential. */
    public end(operation: IOperation, site: Endpoint = this.session.site): void {
        if (operation.isCurrent()) {
            this.replace({ site });
        }
    }

    /** Ends the session and every operation, as a restart does. */
    public revoke(site?: Endpoint): void {
        this.end(this.begin(), site);
    }

    /** Makes `cookie` the credential. The same cookie under another account name keeps the session and its requests. */
    public publish(operation: IOperation, cookie: string | undefined, profile: string | undefined): void {
        if (!operation.isCurrent()) { return; }
        if (cookie === this.session.cookie) {
            this.session = { ...this.session, profile };
        } else {
            this.replace({ site: this.session.site, cookie, profile });
        }
    }

    public setUser(operation: IOperation, user: UserDataType): void {
        if (operation.isCurrent()) {
            this.session = { ...this.session, user };
        }
    }

    /** Runs `write` once the writes queued before it finish, unless `operation` was superseded by then. */
    public commit(operation: IOperation, write: () => Promise<void>): Promise<void> {
        return this.enqueue(async () => {
            if (operation.isCurrent()) {
                await write();
            }
        });
    }

    /** Runs `write` once the writes queued before it finish, whichever operation is current. A failed write does not stop later ones. */
    public enqueue(write: () => Promise<void>): Promise<void> {
        const result = this.writes.then(write);
        this.writes = result.catch(() => undefined);
        return result;
    }

    private replace(next: Omit<ISession, "signal">): void {
        this.ending.abort();
        this.ending = new AbortController();
        this.session = { ...next, signal: this.ending.signal };
    }

    private newOperation(): IOperation {
        const operation: IOperation = { signal: this.superseding.signal, isCurrent: () => operation === this.operation };
        return operation;
    }
}

export const sessionController: SessionController = new SessionController();
