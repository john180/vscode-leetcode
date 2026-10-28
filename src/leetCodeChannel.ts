// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import * as vscode from "vscode";

/** The LeetCode log; VS Code adds the timestamp and level, and "Developer: Set Log Level..." filters it. */
class LeetCodeChannel implements vscode.Disposable {
    private readonly channel: vscode.LogOutputChannel = vscode.window.createOutputChannel("LeetCode", { log: true });

    public info(message: string): void {
        this.channel.info(message);
    }

    public warn(message: string): void {
        this.channel.warn(message);
    }

    public error(message: string): void {
        this.channel.error(message);
    }

    public show(): void {
        this.channel.show();
    }

    public dispose(): void {
        this.channel.dispose();
    }
}

export const leetCodeChannel: LeetCodeChannel = new LeetCodeChannel();
