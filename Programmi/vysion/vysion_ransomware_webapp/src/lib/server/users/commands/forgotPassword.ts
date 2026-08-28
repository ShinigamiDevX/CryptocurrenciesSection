"use server";

import { ForgotPasswordFormSchema } from "$lib/schemas/form.schemas";
import { env } from "$src/env.mjs";
import { symmetricDecrypt } from "$src/lib/utils/crypto.utils";
import { type SubmissionResult } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod";
import { hash } from "bcrypt";
import { UsersRepository } from "../database/users.repository";

export default async function forgotPasswordAction(prevState: unknown, formData: FormData): Promise<SubmissionResult> {
    const submission = parseWithZod(formData, { schema: ForgotPasswordFormSchema });
    if (submission.status !== "success") {
        console.error("Invalid form submission");
        return submission.reply();
    }
    const { email, encryptedTotp, submmittedTotp, newPassword, confirmPassword } = submission.value;
    const user = await UsersRepository.getUserByEmail(email);
    if (!user) {
        console.error("User not found in database");
        return submission.reply({
            fieldErrors: {
                submmittedTotp: ["Invalid TOTP"], // To prevent user enumeration
            },
        });
    }
    if (newPassword !== confirmPassword) {
        console.error("Passwords do not match");
        return submission.reply({
            fieldErrors: {
                newPassword: ["Passwords do not match"],
                confirmPassword: ["Passwords do not match"],
            },
        });
    }
    let decryptedTotp = "";
    try {
        decryptedTotp = symmetricDecrypt(encryptedTotp, env.ENCRYPTION_KEY);
    } catch (error) {
        console.error(error);
        return submission.reply({
            formErrors: ["Error decrypting TOTP"],
        });
    }
    if (decryptedTotp !== submmittedTotp) {
        console.error("Invalid TOTP");
        return submission.reply({
            fieldErrors: {
                submmittedTotp: ["Invalid TOTP"],
            },
        });
    }

    const hashedPassword = await hash(newPassword, 10);
    const updatedUser = await UsersRepository.updateUser(user.id, { password: hashedPassword });
    if (!updatedUser) {
        console.error("Error updating user password");
        return submission.reply({
            formErrors: ["Error updating user password"],
        });
    }
    return submission.reply();
}
