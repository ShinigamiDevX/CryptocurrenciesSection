"use server";

import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type User, UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { UsersRepository } from "../database/users.repository";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/auth";

export async function adminUpdateUserRoleAction(userId: number, newRole: UserRole): Promise<ActionResponse<User>> {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== UserRole.admin) {
        return { success: false, errorCode: ActionErrors.UNAUTHORIZED, errorMessage: "Unauthorized" };
    }
    const updatedUser = await UsersRepository.updateUser(userId, { role: newRole });
    if (!updatedUser) {
        console.error("Error updating user");
        return {
            success: false,
            errorCode: ActionErrors.NOT_FOUND,
            errorMessage: "Error updating user, user not found",
        };
    }
    revalidatePath("/admin");
    return { success: true, data: updatedUser };
}
