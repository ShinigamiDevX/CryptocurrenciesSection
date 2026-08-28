"use server";

import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type User } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/auth";
import { UsersRepository } from "../database/users.repository";

export async function resetSecondFactorAction(): Promise<ActionResponse<User>> {
    const session = await getServerSession(authOptions);
    if (!session) {
        console.error("No session found");
        return { success: false, errorCode: ActionErrors.UNAUTHORIZED, errorMessage: "Unauthorized" };
    }
    const updatedUser = await UsersRepository.updateUser(Number(session.user.id), { twoFactorSecret: null });
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
