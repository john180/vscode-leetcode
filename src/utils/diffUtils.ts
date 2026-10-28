// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

/** Where two strings differ: the length of their common prefix, and of their common suffix after it. */
export interface IDiffRange {
    prefix: number;
    suffix: number;
}

/** Linear in the length of the strings, so it stays cheap for huge outputs. */
export function diffRange(expected: string, actual: string): IDiffRange {
    const limit: number = Math.min(expected.length, actual.length);
    let prefix: number = 0;
    while (prefix < limit && expected[prefix] === actual[prefix]) {
        prefix += 1;
    }
    let suffix: number = 0;
    while (suffix < limit - prefix && expected[expected.length - 1 - suffix] === actual[actual.length - 1 - suffix]) {
        suffix += 1;
    }
    return { prefix, suffix };
}
