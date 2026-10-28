// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { graphql, IGraphQLRequest } from "./client";

interface IFavoriteMutationResult {
    ok: boolean;
    error?: string;
}

export interface IFavoriteTarget {
    slug: string;
    questionId: string;
}

/** Adds the problem to, or removes it from, the list `favoriteIdHash` names; see getDefaultFavoriteList. */
export async function setFavorite(
    request: IGraphQLRequest,
    target: IFavoriteTarget,
    favorite: boolean,
    favoriteIdHash: string,
): Promise<void> {
    const operation: string = favorite ? "addQuestionToFavorite" : "removeQuestionFromFavorite";
    const mutation: string = `
mutation ${operation}($favoriteIdHash: String!, $questionId: String!) {
  ${operation}(favoriteIdHash: $favoriteIdHash, questionId: $questionId) {
    ok
    error
  }
}`;

    const data = await graphql<{ [key: string]: IFavoriteMutationResult }>(request, mutation, {
        favoriteIdHash,
        questionId: target.questionId,
    });
    const result: IFavoriteMutationResult | undefined = data[operation];
    if (!result || !result.ok) {
        throw new Error(result?.error || "LeetCode rejected the favorite update.");
    }
}
