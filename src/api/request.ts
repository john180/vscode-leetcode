// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { currentSite } from "../shared";
import { IGraphQLRequest } from "./client";
import { sessionController } from "../auth/sessionController";

/** A request to the current site, signed in with `cookie` or else the session's cookie. Ending the session aborts it. */
export function getLeetCodeRequest(cookie?: string): IGraphQLRequest {
    const site = currentSite();
    const session = sessionController.current();
    // Until a site change in the settings is handled, the session still belongs to the old site.
    const sessionCookie = session.site === site.endpoint ? session.cookie : undefined;
    return Object.freeze({
        endpoint: site.graphql,
        origin: site.origin,
        cookie: cookie ?? sessionCookie ?? "",
        sessionSignal: session.signal,
        isCurrent: () => !session.signal.aborted && site === currentSite(),
    });
}
