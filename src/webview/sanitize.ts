import sanitizeHtml = require("sanitize-html");

export function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, (char: string) => `&#${char.charCodeAt(0)};`);
}

const allowedTags: string[] = [
    "p", "br", "hr", "div", "span", "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "u", "s", "del", "sub", "sup", "pre", "code", "kbd", "blockquote",
    "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody", "tfoot", "tr", "th", "td",
    "a", "img", "details", "summary",
];

const allowedAttributes: sanitizeHtml.IOptions["allowedAttributes"] = {
    a: ["href", "title"],
    img: ["src", "alt", "title", "width", "height"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
    ol: ["start"],
};

/** Older problems mark inline code with <font face="monospace">. */
const transformTags: sanitizeHtml.IOptions["transformTags"] = {
    font: (_tagName: string, attribs: sanitizeHtml.Attributes) => ({
        tagName: /monospace/i.test(attribs.face ?? "") ? "code" : "span",
        attribs: {},
    }),
};

/** Preserve problem formatting while rejecting executable content and UI overrides. */
export function sanitizeProblemHtml(html: string): string {
    return sanitizeHtml(html, {
        allowedTags,
        allowedAttributes,
        // LeetCode lays out newer examples with these.
        allowedClasses: { div: ["example-block"], span: ["example-io"] },
        transformTags,
        allowedSchemes: ["https"],
        allowProtocolRelative: false,
    });
}

/** Rendered solution markdown, which may embed raw HTML: keep highlighting and code groups, reject the rest as for problems. */
export function sanitizeSolutionHtml(html: string): string {
    return sanitizeHtml(html, {
        allowedTags,
        allowedAttributes: { ...allowedAttributes, details: ["open"] },
        allowedClasses: {
            div: ["code-group"],
            code: ["language-*"],
            span: ["hljs-*", "function_", "class_", "language_"],
        },
        transformTags,
        allowedSchemes: ["https"],
        allowProtocolRelative: false,
    });
}

/** A deliberately narrow CSS font-family grammar; reject escapes and CSS syntax. */
export function safeFontFamily(value: string): string {
    return /^[\p{L}\p{N}\s,'"_-]*$/u.test(value) ? value : "";
}
