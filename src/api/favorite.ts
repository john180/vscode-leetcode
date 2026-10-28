// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { graphql, IGraphQLRequest } from "./client";
import { fetchFavoriteLists, IFavoriteList } from "./favoriteLists";

interface IFavoriteMutationResult {
    ok: boolean;
    error?: string;
}

export interface IFavoriteTarget {
    slug: string;
    questionId: string;
}

async function getFavoriteHash(request: IGraphQLRequest): Promise<string> {
    if (!request.cookie) {
        throw new Error("Not signed in. Please sign in to LeetCode first.");
    }

    // The lists are cached for a few minutes, which is enough to know the default one.
    const lists: IFavoriteList[] = await fetchFavoriteLists(request);
    const favorite: IFavoriteList | undefined = lists.find((list: IFavoriteList) => list.name === "Favorite") || lists[0];
    if (!favorite) {
        throw new Error("LeetCode did not return a favorite list.");
    }
    return favorite.idHash;
}

export async function setFavorite(
    request: IGraphQLRequest,
    target: IFavoriteTarget,
    favorite: boolean,
    favoriteIdHash?: string,
): Promise<void> {
    const targetHash: string = favoriteIdHash || await getFavoriteHash(request);
    const operation: string = favorite ? "addQuestionToFavorite" : "removeQuestionFromFavorite";
    const mutation: string = `
mutation ${operation}($favoriteIdHash: String!, $questionId: String!) {
  ${operation}(favoriteIdHash: $favoriteIdHash, questionId: $questionId) {
    ok
    error
  }
}`;

    const data = await graphql<{ [key: string]: IFavoriteMutationResult }>(request, mutation, {
        favoriteIdHash: targetHash,
        questionId: target.questionId,
    });
    const result: IFavoriteMutationResult | undefined = data[operation];
    if (!result || !result.ok) {
        throw new Error(result?.error || "LeetCode rejected the favorite update.");
    }
}
