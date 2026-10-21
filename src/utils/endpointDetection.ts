// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

const MAINLAND_CHINA_TIME_ZONES: Set<string> = new Set([
    "Asia/Shanghai",
    "Asia/Chongqing",
    "Asia/Harbin",
    "Asia/Urumqi",
    "Asia/Kashgar",
]);

export function isMainlandChinaTimeZone(timeZone: string | undefined): boolean {
    if (!timeZone) {
        return false;
    }
    const normalized: string = timeZone.trim();
    return MAINLAND_CHINA_TIME_ZONES.has(normalized);
}

export function detectEndpointFromTimeZone(timeZone: string | undefined): "leetcode" | "leetcode-cn" {
    return isMainlandChinaTimeZone(timeZone) ? "leetcode-cn" : "leetcode";
}
