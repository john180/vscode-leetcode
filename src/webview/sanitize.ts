import sanitizeHtml = require("sanitize-html");

/** Preserve problem formatting while rejecting executable content and UI overrides. */
export function sanitizeProblemHtml(html: string): string {
    return sanitizeHtml(html, {
        allowedTags: [
            "p", "br", "hr", "div", "span", "h1", "h2", "h3", "h4", "h5", "h6",
            "strong", "b", "em", "i", "u", "s", "sub", "sup", "pre", "code", "blockquote",
            "ul", "ol", "li", "dl", "dt", "dd", "table", "thead", "tbody", "tfoot", "tr", "th", "td",
            "a", "img", "details", "summary",
        ],
        allowedAttributes: {
            a: ["href", "title"],
            img: ["src", "alt", "title", "width", "height"],
            th: ["colspan", "rowspan"],
            td: ["colspan", "rowspan"],
            ol: ["start"],
        },
        allowedSchemes: ["https"],
        allowProtocolRelative: false,
    });
}

/** A deliberately narrow CSS font-family grammar; reject escapes and CSS syntax. */
export function safeFontFamily(value: string): string {
    return /^[\p{L}\p{N}\s,'"_-]*$/u.test(value) ? value : "";
}
