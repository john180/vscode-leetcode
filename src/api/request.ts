// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { globalState } from "../globalState";
import { getEffectiveEndpoint, getUrl } from "../shared";
import { IGraphQLRequest } from "./client";
import { sessionScope } from "../auth/sessionScope";

/** A request to the current endpoint, signed in with `cookie` or else the stored cookie. */
export function getLeetCodeRequest(cookie?: string): IGraphQLRequest {
    const site = getEffectiveEndpoint();
    const endpoint: string = getUrl("graphql");
    const activeCookie = globalState.getCookie(site);
    // The credential is the session: profiles naming the same cookie share it.
    const scope = sessionScope.capture(JSON.stringify([site, activeCookie]));
    return Object.freeze({
        endpoint,
        origin: endpoint.replace(/\/graphql\/?$/, ""),
        cookie: cookie ?? activeCookie ?? "",
        ...scope,
        // Check the live endpoint too: configuration can change before its event handler runs.
        isCurrent: () => !scope.sessionSignal.aborted && endpoint === getUrl("graphql")
            && activeCookie === globalState.getCookie(site),
    });
}
