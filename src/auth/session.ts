// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { EventEmitter } from "events";
import type { IGraphQLRequest } from "../api/client";

export const sessionEvents: EventEmitter = new EventEmitter();

interface IHttpError {
    response?: {
        status?: number;
    };
}

export function isSessionExpiredError(error: unknown): boolean {
    const status: number | undefined = (error as IHttpError | undefined)?.response?.status;
    return status === 401 || status === 403;
}

/**
 * Report failures with their originating session. Credential validation must
 * never invalidate the active account, and old requests cannot affect a new one.
 */
export function reportAuthenticationFailure(request: IGraphQLRequest): void {
    if (request.authenticationCheck || !request.cookie || request.sessionSignal?.aborted || request.isCurrent?.() === false) {
        return;
    }
    sessionEvents.emit("expired", request);
}
