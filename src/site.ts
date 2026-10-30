// Licensed under the MIT license.

export enum Endpoint {
    Auto = "auto",
    LeetCode = "leetcode",
    LeetCodeCN = "leetcode-cn",
}

/** A LeetCode site and the addresses the extension uses on it. */
export interface ISite {
    readonly endpoint: Endpoint.LeetCode | Endpoint.LeetCodeCN;
    /** Also how the UI names the site. */
    readonly host: string;
    readonly origin: string;
    readonly graphql: string;
    readonly login: string;
    readonly premium: string;
}

const LEETCODE: ISite = {
    endpoint: Endpoint.LeetCode,
    host: "leetcode.com",
    origin: "https://leetcode.com",
    graphql: "https://leetcode.com/graphql",
    login: "https://leetcode.com/accounts/login/",
    premium: "https://leetcode.com/subscribe/?ref=lp_pl&source=vscode",
};

const LEETCODE_CN: ISite = {
    endpoint: Endpoint.LeetCodeCN,
    host: "leetcode.cn",
    origin: "https://leetcode.cn",
    graphql: "https://leetcode.cn/graphql",
    login: "https://leetcode.cn/accounts/login/",
    premium: "https://leetcode.cn/premium-payment/?source=vscode",
};

/** The site an endpoint names; anything but leetcode.cn's names leetcode.com. Each site is one object, so sites compare with `===`. */
export function getSite(endpoint: string): ISite {
    return endpoint === Endpoint.LeetCodeCN ? LEETCODE_CN : LEETCODE;
}
