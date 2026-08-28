"use server";

import { UpdatePasswordFormSchema } from "$lib/schemas/form.schemas";
import { authOptions } from "$lib/server/auth/auth";
import { type SubmissionResult } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod";
import { compare, hash } from "bcrypt";
import { getServerSession } from "next-auth";
import { UsersRepository } from "../database/users.repository";

export async function updateUserPasswordAction(prevState: unknown, formData: FormData): Promise<SubmissionResult> {
    const submission = parseWithZod(formData, { schema: UpdatePasswordFormSchema });
    if (submission.status !== "success") {
        return submission.reply();
    }
    const { oldPassword, newPassword, confirmPassword } = submission.value;

    const session = await getServerSession(authOptions);
    if (!session) {
        console.error("No user session found");
        return submission.reply({
            formErrors: ["No user session found"],
        });
    }

    const user = await UsersRepository.getUserById(Number(session.user.id));
    if (!user) {
        console.error("User not found in database");
        return submission.reply({
            formErrors: ["User not found"],
        });
    }
    const passwordCorrect = await compare(oldPassword, user.password);
    if (!passwordCorrect) {
        console.error("Incorrect password");
        return submission.reply({
            fieldErrors: {
                oldPassword: ["Incorrect password"],
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
