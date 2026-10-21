// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

export type DiffType = "same" | "add" | "remove";

export interface IDiffLine {
    type: DiffType;
    text: string;
}

export function diffLines(expected: string, actual: string): IDiffLine[] {
    const left: string[] = expected.replace(/\r\n/g, "\n").split("\n");
    const right: string[] = actual.replace(/\r\n/g, "\n").split("\n");
    const rows: number = left.length;
    const cols: number = right.length;
    const table: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0));

    for (let i: number = 1; i <= rows; i += 1) {
        for (let j: number = 1; j <= cols; j += 1) {
            table[i][j] = left[i - 1] === right[j - 1]
                ? table[i - 1][j - 1] + 1
                : Math.max(table[i - 1][j], table[i][j - 1]);
        }
    }

    const result: IDiffLine[] = [];
    let i: number = rows;
    let j: number = cols;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && left[i - 1] === right[j - 1]) {
            result.push({ type: "same", text: left[i - 1] });
            i -= 1;
            j -= 1;
        } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
            result.push({ type: "add", text: right[j - 1] });
            j -= 1;
        } else {
            result.push({ type: "remove", text: left[i - 1] });
            i -= 1;
        }
    }
    return result.reverse();
}
