"use server";

import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type UserSettings } from "$lib/types/user.types";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/auth";
import { UsersRepository } from "../database/users.repository";

export async function updateUserSettingsAction(
    userId: number,
    settings: UserSettings
): Promise<ActionResponse<UserSettings>> {
    if (!(await getServerSession(authOptions))) {
        return { success: false, errorCode: ActionErrors.UNAUTHORIZED, errorMessage: "Unauthorized" };
    }
    const updatedUser = await UsersRepository.updateUser(userId, { settings });
    if (!updatedUser) {
        return { success: false, errorCode: ActionErrors.NOT_FOUND, errorMessage: "User not found" };
    }
    return { success: true, data: updatedUser.settings as UserSettings };
}
