"use server";

import { authOptions } from "$lib/server/auth/auth";
import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type UserInfo } from "$lib/types/user.types";
import { getServerSession } from "next-auth";
import { UsersRepository } from "../../users/database/users.repository";

export async function getLoggedUserAction(): Promise<ActionResponse<UserInfo>> {
    const session = await getServerSession(authOptions);
    if (!session) {
        console.error("No session found");
        return { success: false, errorCode: ActionErrors.UNAUTHORIZED, errorMessage: "Unauthorized" };
    }
    const dbUser = await UsersRepository.getUserInfoById(Number(session.user.id));
    if (!dbUser) {
        console.error("User not found");
        return { success: false, errorCode: ActionErrors.NOT_FOUND, errorMessage: "User not found" };
    }
    return { success: true, data: dbUser };
}
