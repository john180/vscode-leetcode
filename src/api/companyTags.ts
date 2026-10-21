// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { graphql, IGraphQLRequest } from "./client";
import { COMPANY_TAGS_QUERY } from "./queries";

interface ICompanyTagNode {
    name?: string;
    slug?: string;
}

interface ICompanyTagsResponse {
    companyTagsV2?: {
        companyTagInfoNodes?: ICompanyTagNode[];
        hasMore?: boolean;
    };
}

/**
 * Loads the endpoint's company tag names once. The problem list only exposes
 * company slugs, so this map is used to show localized names without one
 * questionData request per problem.
 */
export async function fetchCompanyTagNames(request: IGraphQLRequest): Promise<Map<string, string>> {
    const names: Map<string, string> = new Map<string, string>();
    let offset: number = 0;
    for (;;) {
        const data = await graphql<ICompanyTagsResponse>(request, COMPANY_TAGS_QUERY, { offset });
        const nodes: ICompanyTagNode[] = data.companyTagsV2?.companyTagInfoNodes || [];
        for (const node of nodes) {
            if (node.slug && node.name) {
                names.set(node.slug, node.name);
            }
        }
        if (!data.companyTagsV2?.hasMore || nodes.length === 0) {
            break;
        }
        offset += nodes.length;
    }
    return names;
}
