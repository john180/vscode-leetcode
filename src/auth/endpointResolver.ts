// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";
import { Endpoint, setResolvedEndpoint } from "../shared";
import { detectEndpointFromTimeZone } from "../utils/endpointDetection";

/**
 * Resolves the effective endpoint once per activation. A manually selected
 * endpoint always wins; "auto" uses the system time zone as the mainland-China
 * signal so the extension works without a network round trip.
 */
export async function resolveEndpoint(): Promise<Endpoint> {
    const configured: string = vscode.workspace.getConfiguration("leetcode").get<string>("endpoint", Endpoint.Auto);
    if (configured !== Endpoint.Auto) {
        const endpoint: Endpoint = configured === Endpoint.LeetCodeCN ? Endpoint.LeetCodeCN : Endpoint.LeetCode;
        setResolvedEndpoint(endpoint);
        return endpoint;
    }

    const timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const endpoint: Endpoint = detectEndpointFromTimeZone(timeZone) === Endpoint.LeetCodeCN
        ? Endpoint.LeetCodeCN
        : Endpoint.LeetCode;
    setResolvedEndpoint(endpoint);
    return endpoint;
}
