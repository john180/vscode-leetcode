// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { globalState } from "../globalState";
import { currentSite } from "../shared";
import { IGraphQLRequest } from "./client";
import { sessionScope } from "../auth/sessionScope";

/** A request to the current site, signed in with `cookie` or else the stored cookie. */
export function getLeetCodeRequest(cookie?: string): IGraphQLRequest {
    const site = currentSite();
    const activeCookie = globalState.getCookie(site.endpoint);
    // The credential is the session: profiles naming the same cookie share it.
    const scope = sessionScope.capture(JSON.stringify([site.endpoint, activeCookie]));
    return Object.freeze({
        endpoint: site.graphql,
        origin: site.origin,
        cookie: cookie ?? activeCookie ?? "",
        ...scope,
        // Check the live site too: configuration can change before its event handler runs.
        isCurrent: () => !scope.sessionSignal.aborted && site === currentSite()
            && activeCookie === globalState.getCookie(site.endpoint),
    });
}
