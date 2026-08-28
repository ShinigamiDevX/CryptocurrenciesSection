"use server";

import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { generatePassword } from "$lib/utils/crypto.utils";
import { hash } from "bcrypt";
import { UsersRepository } from "../database/users.repository";
import { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/auth";

export async function adminResetUserPasswordAction(userId: number): Promise<ActionResponse<string>> {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== UserRole.admin) {
        return { success: false, errorCode: ActionErrors.UNAUTHORIZED, errorMessage: "Unauthorized" };
    }
    const randomPassword = generatePassword();
    const hashedPassword = await hash(randomPassword, 10);
    const updatedUser = await UsersRepository.updateUser(userId, { password: hashedPassword });
    if (!updatedUser) {
        console.error("Error updating user");
        return {
            success: false,
            errorCode: ActionErrors.NOT_FOUND,
            errorMessage: "Error updating user, user not found",
        };
    }
    return { success: true, data: randomPassword };
}
