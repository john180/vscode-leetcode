// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import type { IQuestionListPage } from "./problemMapper";

export type QuestionPageFetcher = (skip: number, limit: number) => Promise<IQuestionListPage>;

/**
 * Loads a paginated list whose total is not exposed by the API. Pages are
 * fetched until a short page is observed; the caller may run several page
 * requests concurrently because the end cannot be known in advance.
 */
export async function loadGlobalQuestionPages(
    fetchPage: QuestionPageFetcher,
    pageSize: number = 100,
    concurrency: number = 4,
): Promise<IQuestionListPage[]> {
    const pages: IQuestionListPage[] = [await fetchPage(0, pageSize)];
    let skip: number = pageSize;
    while (pages[pages.length - 1].questions.length === pageSize) {
        const batch: IQuestionListPage[] = await Promise.all(
            Array.from({ length: concurrency }, (_, index: number) => fetchPage(skip + index * pageSize, pageSize)),
        );
        pages.push(...batch);
        if (batch.some((page: IQuestionListPage) => page.questions.length < pageSize)) {
            break;
        }
        skip += pageSize * concurrency;
    }
    return pages;
}
