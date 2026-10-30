// Licensed under the MIT license.

/** The input LeetCode receives: one argument per line, without the line breaks an editor leaves at the end. */
export function normalizeTestInput(text: string): string {
    return text.replace(/\r\n?/g, "\n").replace(/\s+$/, "");
}

/** `text` with `input` added as its last test case, or undefined when `text` already has `input`'s lines in a row. */
export function appendTestCase(text: string, input: string): string | undefined {
    const current: string = normalizeTestInput(text);
    const added: string = normalizeTestInput(input);
    if (!added || `\n${current}\n`.includes(`\n${added}\n`)) {
        return undefined;
    }
    return current ? `${current}\n${added}` : added;
}

/** How many lines one test case takes: those of the first example, or one per parameter when there is no example. */
export function getLinesPerTestCase(sampleTestCase: string | undefined, paramNames: string[]): number {
    const sample: string = normalizeTestInput(sampleTestCase ?? "");
    return sample ? sample.split("\n").length : paramNames.length;
}

export interface ITestCaseLine {
    /** Counted from 1. */
    case: number;
    /** Whether the line starts its case. */
    first: boolean;
    /** The parameter the line sets, when a case has one line per parameter. */
    param?: string;
}

/** What each of `lineCount` input lines is, in cases of `linesPerCase` lines; nothing while the size of a case is unknown. */
export function describeTestCaseLines(lineCount: number, linesPerCase: number, paramNames: string[]): ITestCaseLine[] {
    if (linesPerCase < 1) {
        return [];
    }
    // Some problems read more lines than their function takes, such as a linked list and where its cycle starts.
    const named: boolean = paramNames.length === linesPerCase;
    return Array.from({ length: lineCount }, (_, index: number) => ({
        case: Math.floor(index / linesPerCase) + 1,
        first: index % linesPerCase === 0,
        ...(named ? { param: paramNames[index % linesPerCase] } : {}),
    }));
}
