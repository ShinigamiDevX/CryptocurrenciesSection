"use server";

import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { UserRole, type User } from "@prisma/client";
import { UsersRepository } from "../database/users.repository";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/auth";

export async function adminResetSecondFactorAction(userId: number): Promise<ActionResponse<User>> {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== UserRole.admin) {
        return { success: false, errorCode: ActionErrors.UNAUTHORIZED, errorMessage: "Unauthorized" };
    }
    const updatedUser = await UsersRepository.updateUser(userId, { twoFactorSecret: null });
    if (!updatedUser) {
        console.error("Error updating user");
        return {
            success: false,
            errorCode: ActionErrors.NOT_FOUND,
            errorMessage: "Error updating user, user not found",
        };
    }
    return { success: true, data: updatedUser };
}
