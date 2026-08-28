"use server";

import { EmailSchema } from "$lib/schemas/form.schemas";
import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { env } from "$src/env.mjs";
import { generateTotp, symmetricEncrypt } from "$src/lib/utils/crypto.utils";
import { sendEmail } from "$src/lib/utils/email.utils";
import { UsersRepository } from "../../users/database/users.repository";

export default async function sendForgotPasswordEmailAction(email: string): Promise<ActionResponse<string>> {
    const validatedEmail = EmailSchema.safeParse(email);
    if (!validatedEmail.success) {
        return {
            success: false,
            errorCode: ActionErrors.BAD_REQUEST,
            errorMessage: validatedEmail.error.errors[0]!.message,
        };
    }
    const generatedTotp = generateTotp();
    let encryptedTotp = "";
    try {
        encryptedTotp = symmetricEncrypt(generatedTotp.toString(), env.ENCRYPTION_KEY);
    } catch (error) {
        console.error(error);
        return {
            success: false,
            errorCode: ActionErrors.INTERNAL_SERVER_ERROR,
            errorMessage: "Error encrypting TOTP, invalid encryption key format?",
        };
    }
    const user = await UsersRepository.getUserByEmail(email);
    if (!user) {
        // Don't reveal if user exists or not
        return { success: true, data: encryptedTotp };
    }

    const success = await sendEmail({
        from: `"Vysion Ransomware Password Recovery Service" ${env.MAIL_FROM}`,
        to: email,
        subject: "Your Vysion Password Reset Code",
        html: `
                <div style="font-size: medium">
                    <p>Here is your Vysion Ransomware password reset code: <strong>${generatedTotp}</strong></p>
                    <p>If you didn't request this code, you can safely ignore this email.</p>
                </div>
                `,
    });
    if (!success) {
        return { success: false, errorCode: ActionErrors.INTERNAL_SERVER_ERROR, errorMessage: "Failed to send email" };
    }
    return { success: true, data: encryptedTotp };
}
