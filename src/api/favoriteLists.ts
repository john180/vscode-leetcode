// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { IGraphQLRequest } from "./client";
import { send } from "./http";

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

const CACHE_TTL_MS = 5 * 60 * 1000;

interface IFavoriteData {
    lists: IFavoriteList[];
    hot100?: IFavoriteList;
}

let cache: { key: string; at: number; data: IFavoriteData } | undefined;

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

async function fetchFavoritePayload(request: IGraphQLRequest): Promise<IFavoriteListResponse> {
    const response = await send<IFavoriteListResponse>(request, { url: `${request.origin}/list/api/questions` });
    return response.data;
}

export async function fetchFavoriteData(
    request: IGraphQLRequest,
    forceRefresh: boolean = false,
): Promise<IFavoriteData> {
    if (!request.cookie) {
        return { lists: [] };
    }
    const key: string = `${request.origin}|${request.cookie}`;
    if (!forceRefresh && cache && cache.key === key && Date.now() - cache.at < CACHE_TTL_MS) {
        return cache.data;
    }
    const payload = await fetchFavoritePayload(request);
    const data: IFavoriteData = {
        lists: mapFavoriteLists(payload),
        hot100: mapHot100List(payload),
    };
    cache = { key, at: Date.now(), data };
    return data;
}

export async function fetchFavoriteLists(request: IGraphQLRequest): Promise<IFavoriteList[]> {
    return (await fetchFavoriteData(request)).lists;
}

export async function fetchHot100List(request: IGraphQLRequest): Promise<IFavoriteList | undefined> {
    return (await fetchFavoriteData(request)).hot100;
}
