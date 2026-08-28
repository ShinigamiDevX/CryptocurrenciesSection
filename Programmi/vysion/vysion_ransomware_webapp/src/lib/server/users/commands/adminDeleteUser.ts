"use server";

import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { UserRole, type User } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { UsersRepository } from "../database/users.repository";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/auth";

export async function adminDeleteUserAction(userId: number): Promise<ActionResponse<User>> {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== UserRole.admin) {
        return { success: false, errorCode: ActionErrors.UNAUTHORIZED, errorMessage: "Unauthorized" };
    }
    const deletedUser = await UsersRepository.deleteUser(userId);
    if (!deletedUser) {
        console.error("Error deleting user");
        return {
            success: false,
            errorCode: ActionErrors.NOT_FOUND,
            errorMessage: "Error deleting user, user not found",
        };
    }
    revalidatePath("/admin");
    return { success: true, data: deletedUser };
}
