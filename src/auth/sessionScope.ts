// Licensed under the MIT license.

/** Revokes all requests belonging to a credential generation, including queued work. */
export class SessionScope {
    private controller = new AbortController();
    private revision = 0;
    private identity: string | undefined;

    public capture(identity: string): { revision: number; sessionSignal: AbortSignal } {
        if (this.identity !== identity) {
            this.invalidate();
            this.identity = identity;
        }
        return { revision: this.revision, sessionSignal: this.controller.signal };
    }

    public invalidate(): void {
        this.controller.abort();
        this.controller = new AbortController();
        this.revision++;
        this.identity = undefined;
    }
}

export const sessionScope = new SessionScope();
