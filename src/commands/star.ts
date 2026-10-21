// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { fetchQuestionDetail } from "../api/question";
import { setFavorite } from "../api/favorite";
import { fetchFavoriteLists, IFavoriteList } from "../api/favoriteLists";
import { getLeetCodeRequest } from "../api/request";
import { updateCachedFavorite } from "../api/problems";
import { customCodeLensProvider } from "../codelens/CustomCodeLensProvider";
import { LeetCodeNode } from "../explorer/LeetCodeNode";
import { leetCodeTreeDataProvider } from "../explorer/LeetCodeTreeDataProvider";
import { IQuickItemEx } from "../shared";
import { hasStarShortcut } from "../utils/settingUtils";
import { l10n, window } from "vscode";
import { DialogType, promptForOpenOutputChannel } from "../utils/uiUtils";

export async function addFavorite(node: LeetCodeNode): Promise<void> {
    await toggleFavorite(node, true);
}

export async function removeFavorite(node: LeetCodeNode): Promise<void> {
    await toggleFavorite(node, false);
}

export async function addToFavoriteList(node: LeetCodeNode): Promise<void> {
    try {
        const lists: IFavoriteList[] = await fetchFavoriteLists(getLeetCodeRequest());
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
            await toggleFavorite(node, true, choice.value.idHash);
        }
    } catch (error) {
        await promptForOpenOutputChannel(
            l10n.t("Failed to load favorite lists. Please open the output channel for details."),
            DialogType.error,
        );
    }
}

async function toggleFavorite(node: LeetCodeNode, favorite: boolean, favoriteIdHash?: string): Promise<void> {
    try {
        const request = getLeetCodeRequest();
        const detail = await fetchQuestionDetail(request, node.slug);
        await setFavorite(request, { slug: node.slug, questionId: detail.questionId }, favorite, favoriteIdHash);
        updateCachedFavorite(node.id, favorite);
        await leetCodeTreeDataProvider.refresh();
        if (hasStarShortcut()) {
            customCodeLensProvider.refresh();
        }
    } catch (error) {
        const action: string = favorite ? l10n.t("add the problem to favorite") : l10n.t("remove the problem from favorite");
        await promptForOpenOutputChannel(l10n.t("Failed to {0}. Please open the output channel for details.", action), DialogType.error);
    }
}
