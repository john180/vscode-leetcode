// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import axios from "axios";
import { EventEmitter } from "events";

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

let interceptorInstalled: boolean = false;

/**
 * Turns a 401/403 into one session event. The manager verifies the session
 * before signing out, since LeetCode also answers 403 to CSRF failures and bot
 * challenges, and owns the state transition and the user prompt, so every HTTP
 * path shares the same behaviour.
 */
export function installSessionInterceptor(): void {
    if (interceptorInstalled) {
        return;
    }
    interceptorInstalled = true;
    axios.interceptors.response.use(undefined, (error: unknown) => {
        if (isSessionExpiredError(error)) {
            sessionEvents.emit("expired");
        }
        return Promise.reject(error);
    });
}

installSessionInterceptor();
