// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { graphql, IGraphQLRequest } from "./client";
import { send } from "./http";

interface IFavoriteEntry {
    name: string;
    id_hash: string;
}

interface IFavoriteListResponse {
    favorites?: {
        private_favorites?: IFavoriteEntry[];
    };
}

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

    const response = await send<IFavoriteListResponse>(request, { url: `${request.origin}/list/api/questions` });

    const favorites: IFavoriteEntry[] = response.data?.favorites?.private_favorites || [];
    const favorite: IFavoriteEntry | undefined = favorites.find((item: IFavoriteEntry) => item.name === "Favorite") || favorites[0];
    if (!favorite || !favorite.id_hash) {
        throw new Error("LeetCode did not return a favorite list.");
    }
    return favorite.id_hash;
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
