// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { setFavorite } from "../api/favorite";
import { getDefaultFavoriteList, IFavoriteList } from "../api/favoriteLists";
import { getLeetCodeRequest } from "../api/request";
import { getFavoriteData, getProblemBySlug, getProblemCacheScope, updateCachedFavorite } from "../api/problems";
import { customCodeLensProvider } from "../codelens/CustomCodeLensProvider";
import { LeetCodeNode } from "../explorer/LeetCodeNode";
import { leetCodeTreeDataProvider } from "../explorer/LeetCodeTreeDataProvider";
import { IQuickItemEx } from "../shared";
import { hasStarShortcut } from "../utils/settingUtils";
import { l10n, window } from "vscode";
import { DialogType, promptForOpenOutputChannel } from "../utils/uiUtils";
import { assertRequestActive } from "../api/cancellation";
import { isCanceled } from "../api/http";

export async function addFavorite(node: LeetCodeNode): Promise<void> {
    await toggleFavorite(node, true);
}

export async function removeFavorite(node: LeetCodeNode): Promise<void> {
    await toggleFavorite(node, false);
}

export async function addToFavoriteList(node: LeetCodeNode): Promise<void> {
    try {
        const request = getLeetCodeRequest();
        const lists: IFavoriteList[] = (await getFavoriteData()).lists;
        assertRequestActive(request);
        if (lists.length === 0) {
            await addFavorite(node);
            return;
        }
        const picks: Array<IQuickItemEx<IFavoriteList>> = lists.map((list: IFavoriteList) => ({
            label: list.name === "Favorite" ? l10n.t("Favorite") : list.name,
            description: `${list.questions.length}`,
            value: list,
        }));
        const choice: IQuickItemEx<IFavoriteList> | undefined = await window.showQuickPick(picks, {
            placeHolder: l10n.t("Select a favorite list"),
        });
        if (choice) {
            assertRequestActive(request);
            await toggleFavorite(node, true, choice.value.idHash);
        }
    } catch (error) {
        if (isCanceled(error)) { return; }
        await promptForOpenOutputChannel(
            l10n.t("Failed to load favorite lists. Please open the output channel for details."),
            DialogType.error,
            error,
        );
    }
}

async function toggleFavorite(node: LeetCodeNode, favorite: boolean, favoriteIdHash?: string): Promise<void> {
    try {
        const scope = getProblemCacheScope();
        const request = getLeetCodeRequest();
        // The cached metadata has the internal id the mutation needs; the full detail is not needed.
        const problem = await getProblemBySlug(node.slug);
        assertRequestActive(request);
        if (!problem?.questionId) {
            throw new Error(`Problem not found: ${node.slug}`);
        }
        const listHash: string | undefined = favoriteIdHash ?? getDefaultFavoriteList((await getFavoriteData()).lists)?.idHash;
        assertRequestActive(request);
        if (!listHash) {
            throw new Error("LeetCode did not return a favorite list.");
        }
        await setFavorite(request, { slug: node.slug, questionId: problem.questionId }, favorite, listHash);
        if (scope !== getProblemCacheScope()) { return; }
        await updateCachedFavorite(node.id, favorite);
        await leetCodeTreeDataProvider.refresh();
        if (hasStarShortcut()) {
            customCodeLensProvider.refresh();
        }
    } catch (error) {
        if (isCanceled(error)) { return; }
        const action: string = favorite ? l10n.t("add the problem to favorite") : l10n.t("remove the problem from favorite");
        await promptForOpenOutputChannel(l10n.t("Failed to {0}. Please open the output channel for details.", action), DialogType.error, error);
    }
}
