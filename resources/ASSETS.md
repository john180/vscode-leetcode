# Image assets

## Extension and view icons

- `LeetCode.svg`: a centered, monochrome 24 x 24 view-container icon, adapted from this project's original vector artwork credited to [JIEJIAN21](https://github.com/JIEJIAN21).
- `LeetCode-icon.svg`: the editable 256 x 256 extension-icon master, using the same outline with orange and gray fills on a dark rounded tile. The tile preserves contrast in both light and dark extension lists.
- `LeetCode.png`: the 256 x 256 raster export of that master, used by `package.json`. Re-export the SVG at its native size with an SVG renderer when changing the artwork; do not upscale the old bitmap. The master is excluded from the VSIX.

The inherited outline is from [LeetCode-OpenSource/vscode-leetcode](https://github.com/LeetCode-OpenSource/vscode-leetcode/blob/master/resources/LeetCode.svg) and remains covered by the project's MIT license. These assets identify this community extension; they do not imply endorsement by LeetCode.

## Favorite icons

The command contributions use VS Code's built-in `star-empty` and `star-full` theme icons. The Webview uses the matching Microsoft Codicons SVGs as CSS masks, colored with VS Code theme variables.

- Source: [microsoft/vscode-codicons](https://github.com/microsoft/vscode-codicons/tree/5a6ad49557af022f97987cb3cfc3412b5d03f554/src/icons), revision `5a6ad49557af022f97987cb3cfc3412b5d03f554`.
- Files: `webview/icons/star-empty.svg` and `webview/icons/star-full.svg`.
- Creator: Microsoft Corporation.
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). The upstream license is included in `webview/icons/LICENSE`.
- Changes: none to the SVG artwork; the extension applies color and size through CSS.

## Problem and solution images

Images remain supplied by LeetCode and solution authors. The preview does not recolor or invert their pixels. In dark and high-contrast dark themes, images start with a white backing for transparent black-line diagrams; light themes leave them transparent. Hovering or focusing an image large enough to hold it exposes a keyboard-accessible **White background** toggle; images inside links that also hold text or other images keep the theme default. A choice that differs from the theme default is retained per page and image in Webview state, with a bounded history.
