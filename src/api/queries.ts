// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

export const PROBLEM_LIST_QUERY: string = `
query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
  problemsetQuestionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
    total
    questions {
      frontendQuestionId
      title
      titleCn
      titleSlug
      difficulty
      paidOnly
      acRate
      status
      isFavor
      topicTags { name nameTranslated slug }
      extra { topCompanyTags { slug name } }
    }
  }
}`;
