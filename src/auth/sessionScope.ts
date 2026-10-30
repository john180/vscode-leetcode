// Licensed under the MIT license.

/** Revokes all requests belonging to a credential generation, including queued work. */
export class SessionScope {
    private controller = new AbortController();
    private identity: string | undefined;

    public capture(identity: string): { sessionSignal: AbortSignal } {
        if (this.identity !== identity) {
            this.invalidate();
            this.identity = identity;
        }
        return { sessionSignal: this.controller.signal };
    }

    public invalidate(): void {
        this.controller.abort();
        this.controller = new AbortController();
        this.identity = undefined;
    }
}

export const sessionScope = new SessionScope();
