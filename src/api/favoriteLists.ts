// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import axios from "axios";
import { IGraphQLRequest } from "./client";

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
    };
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

export async function fetchFavoriteLists(request: IGraphQLRequest): Promise<IFavoriteList[]> {
    if (!request.cookie) {
        return [];
    }
    const response = await axios.get<IFavoriteListResponse>(`${request.origin}/list/api/questions`, {
        timeout: 20000,
        headers: {
            "cookie": request.cookie,
            "origin": request.origin,
            "referer": `${request.origin}/problemset/`,
            "x-requested-with": "XMLHttpRequest",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) vscode-leetcode/0.20",
        },
    });
    return mapFavoriteLists(response.data);
}
