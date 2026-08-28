"use server";

import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { symmetricEncrypt } from "$lib/utils/crypto.utils";
import { env } from "$src/env.mjs";
import { authenticator } from "otplib";
import { UsersRepository } from "../users/database/users.repository";

export async function checkOrSetup2faAction(email: string): Promise<ActionResponse<string>> {
    const user = await UsersRepository.getUserByEmail(email);
    if (!user) {
        return {
            success: false,
            errorCode: ActionErrors.NOT_FOUND,
            errorMessage: "User not found",
        };
    }

    let keyUri = "";
    if (!user.twoFactorSecret) {
        const secret = authenticator.generateSecret(32);
        keyUri = authenticator.keyuri(email, "Vysion Ransomware", secret);
        let encryptedSecret = "";
        try {
            encryptedSecret = symmetricEncrypt(secret, env.ENCRYPTION_KEY);
        } catch (error) {
            console.error(error);
            return {
                success: false,
                errorCode: ActionErrors.INTERNAL_SERVER_ERROR,
                errorMessage: "Error encrypting 2FA secret, invalid encryption key format?",
            };
        }
        const updatedUser = await UsersRepository.updateUser(user.id, { twoFactorSecret: encryptedSecret });
        if (!updatedUser) {
            console.error("Error updating user with 2FA secret");
            return {
                success: false,
                errorCode: ActionErrors.INTERNAL_SERVER_ERROR,
                errorMessage: "Error updating user with 2FA secret",
            };
        }
    }
    return { success: true, data: keyUri };
}
