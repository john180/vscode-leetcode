// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { globalState } from "../globalState";
import { getUrl } from "../shared";
import { IGraphQLRequest } from "./client";

/** A request to the current endpoint, signed in with `cookie` or else the stored cookie. */
export function getLeetCodeRequest(cookie: string | undefined = globalState.getCookie()): IGraphQLRequest {
    const endpoint: string = getUrl("graphql");
    return {
        endpoint,
        origin: endpoint.replace(/\/graphql\/?$/, ""),
        cookie: cookie || "",
    };
}
