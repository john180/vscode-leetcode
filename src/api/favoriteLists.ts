// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { IGraphQLRequest } from "./client";
import { send } from "./http";
import { invalidResponse } from "./errors";

export interface IFavoriteQuestion {
    id: string;
    title: string;
    titleSlug: string;
}

export interface IFavoriteList {
    idHash: string;
    name: string;
    questions: IFavoriteQuestion[];
}

interface IRawFavoriteQuestion {
    id?: string | number;
    title?: string;
    title_slug?: string;
}

interface IRawFavoriteList {
    id_hash?: string;
    name?: string;
    questions?: IRawFavoriteQuestion[];
}

interface IFavoriteListResponse {
    favorites?: {
        private_favorites?: IRawFavoriteList[];
        public_favorites?: IRawFavoriteList[];
        leetcode_favorites?: IRawFavoriteList[];
    };
}

export interface IFavoriteData {
    lists: IFavoriteList[];
    hot100?: IFavoriteList;
}

export function mapFavoriteLists(data: unknown): IFavoriteList[] {
    const favorites = (data as IFavoriteListResponse | undefined)?.favorites;
    const lists: IRawFavoriteList[] = [
        ...(favorites?.private_favorites || []),
        ...(favorites?.public_favorites || []),
    ];
    return lists
        .filter((list: IRawFavoriteList) => Boolean(list.id_hash && list.name))
        .map((list: IRawFavoriteList) => ({
            idHash: String(list.id_hash),
            name: String(list.name),
            questions: (list.questions || [])
                .filter((question: IRawFavoriteQuestion) => Boolean(question.title_slug || question.title))
                .map((question: IRawFavoriteQuestion) => ({
                    id: String(question.id || question.title_slug || question.title),
                    title: question.title || question.title_slug || "",
                    titleSlug: question.title_slug || "",
                })),
        }));
}

export function mapHot100List(data: unknown): IFavoriteList | undefined {
    const lists: IRawFavoriteList[] = (data as IFavoriteListResponse | undefined)?.favorites?.leetcode_favorites || [];
    const hot100: IRawFavoriteList | undefined = lists.find(
        (list: IRawFavoriteList) => /HOT\s*100|热题\s*100|TOP\s*100\s*LIKED/i.test(list.name || ""),
    );
    if (!hot100) {
        return undefined;
    }
    return mapFavoriteLists({ favorites: { private_favorites: [hot100] } })[0];
}

/** The list a favorite goes to when none is chosen. */
export function getDefaultFavoriteList(lists: IFavoriteList[]): IFavoriteList | undefined {
    return lists.find((list: IFavoriteList) => list.name === "Favorite") || lists[0];
}

/** Uncached; the problem cache keeps the result. */
export async function fetchFavoriteData(request: IGraphQLRequest): Promise<IFavoriteData> {
    if (!request.cookie) {
        return { lists: [] };
    }
    const response = await send<IFavoriteListResponse>(request, { url: `${request.origin}/list/api/questions` });
    const favorites = response.data.favorites;
    if (!favorites || typeof favorites !== "object" || Array.isArray(favorites)
        || [favorites.private_favorites, favorites.public_favorites, favorites.leetcode_favorites].some((lists) => lists !== undefined && lists !== null && !Array.isArray(lists))) {
        throw invalidResponse("LeetCode returned an invalid favorite list response.");
    }
    return {
        lists: mapFavoriteLists(response.data),
        hot100: mapHot100List(response.data),
    };
}
