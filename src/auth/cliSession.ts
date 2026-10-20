// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as cp from "child_process";

const DEFAULT_TIMEOUT_MS = 15000;
const SUCCESS_REGEX: RegExp = /(?:.*)Successfully .*login as (.*)/i;
const FAIL_REGEX: RegExp = /.*\[ERROR\].*/i;

export interface ICliLoginOptions {
    nodePath: string;
    binaryPath: string;
    cookie: string;
    name: string;
    useWsl: boolean;
    env: NodeJS.ProcessEnv;
    appendOutput: (text: string) => void;
    timeoutMs?: number;
}

function stripQuotes(value: string): string {
    return value.replace(/^"+|"+$/g, "");
}

/**
 * Feeds a cookie into the bundled LeetCode CLI through stdin so that the CLI
 * session and the extension share the same account.
 *
 * The child process is spawned without a shell, and the promise always settles:
 * success, explicit CLI error, unexpected exit, or timeout.
 */
export async function loginCliWithCookie(options: ICliLoginOptions): Promise<void> {
    const nodePath: string = stripQuotes(options.nodePath);
    const binaryPath: string = stripQuotes(options.binaryPath);
    const timeoutMs: number = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const args: string[] = [binaryPath, "user", "-c"];

    const childProc: cp.ChildProcess = options.useWsl
        ? cp.spawn("wsl", [nodePath, ...args], { shell: false, env: options.env })
        : cp.spawn(nodePath, args, { shell: false, env: options.env });

    await new Promise<void>((resolve: () => void, reject: (error: Error) => void): void => {
        let settled: boolean = false;
        let sentName: boolean = false;
        let sentCookie: boolean = false;
        let outputTail: string = "";
        let timer: NodeJS.Timeout;

        const redact = (text: string): string => text.split(options.cookie).join("[redacted]");

        const finish = (error?: Error): void => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            childProc.stdin?.end();
            if (error) {
                reject(error);
            } else {
                resolve();
            }
        };

        timer = setTimeout(() => {
            finish(new Error(`Timed out after ${timeoutMs / 1000}s while updating the bundled CLI session.`));
            childProc.kill();
        }, timeoutMs);

        childProc.stdout?.on("data", (data: Buffer) => {
            const text: string = data.toString();
            outputTail = (outputTail + text).slice(-4000);
            options.appendOutput(redact(text));

            if (SUCCESS_REGEX.test(outputTail)) {
                finish();
                return;
            }
            if (FAIL_REGEX.test(outputTail)) {
                finish(new Error("The LeetCode CLI rejected the cookie."));
                return;
            }

            if (!sentName && /login:\s/.test(outputTail)) {
                sentName = true;
                childProc.stdin?.write(`${options.name}\n`);
            }
            if (!sentCookie && sentName && /cookie:\s/.test(outputTail)) {
                sentCookie = true;
                childProc.stdin?.write(`${options.cookie}\n`);
            }
        });

        childProc.stdin?.on("error", (error: Error) => {
            finish(error instanceof Error ? error : new Error(String(error)));
        });

        childProc.stderr?.on("data", (data: Buffer) => {
            options.appendOutput(redact(data.toString()));
        });

        childProc.on("error", (error: Error) => {
            finish(error instanceof Error ? error : new Error(String(error)));
        });
        childProc.on("close", (code: number | null) => {
            if (!settled) {
                finish(new Error(`The LeetCode CLI exited before confirming login (code ${code ?? "unknown"}).`));
            }
        });
    });
}
