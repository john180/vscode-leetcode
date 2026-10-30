import { graphql, IGraphQLRequest } from "../api/client";
import { getLeetCodeRequest } from "../api/request";
import { UserDataType } from "../globalState";

const graphqlStr = `
    query globalData {
        userStatus {
            isPremium
            isVerified
            username
            avatar
            isSignedIn
        }
    }
`;

export const queryUserData = async (cookie?: string, signal?: AbortSignal): Promise<UserDataType> => {
    const request: IGraphQLRequest = { ...getLeetCodeRequest(cookie), authenticationCheck: true, signal };
    if (!request.cookie) {
        throw new Error("Failed to obtain the cookie. Please log in again.");
    }
    const data = await graphql<{ userStatus?: UserDataType }>(request, graphqlStr);
    if (!data.userStatus) {
        throw new Error("LeetCode did not return user status.");
    }
    return data.userStatus;
};
