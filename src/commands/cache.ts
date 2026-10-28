// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { problemCache } from "../api/problemCache";

export async function deleteCache(): Promise<void> {
    await problemCache.clear();
}
