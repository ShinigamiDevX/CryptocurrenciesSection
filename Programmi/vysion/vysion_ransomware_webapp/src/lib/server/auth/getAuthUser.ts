"use server";

import { authOptions } from "$lib/server/auth/auth";
import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type UserInfo } from "$lib/types/user.types";
import { getServerSession } from "next-auth";
import { UsersRepository } from "../users/database/users.repository";

export async function getAuthUserAction(): Promise<ActionResponse<UserInfo>> {
    const session = await getServerSession(authOptions);
    if (!session) {
        return { success: false, errorCode: ActionErrors.UNAUTHORIZED, errorMessage: "Unauthorized" };
    }
    // Check if user exists in the database
    const userInfo = await UsersRepository.getUserInfoById(Number(session.user.id));
    if (!userInfo) {
        return { success: false, errorCode: ActionErrors.NOT_FOUND, errorMessage: "User not found" };
    }
    return { success: true, data: userInfo };
}
