"use server";

import { LoginFormSchema } from "$lib/schemas/form.schemas";
import { type SubmissionResult } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod";
import { compare } from "bcrypt";
import { UsersRepository } from "../users/database/users.repository";

export async function firstFactorAuthAction(prevState: unknown, formData: FormData): Promise<SubmissionResult> {
    const submission = parseWithZod(formData, { schema: LoginFormSchema });
    if (submission.status !== "success") {
        return submission.reply();
    }
    const { email, password } = submission.value;

    const user = await UsersRepository.getUserByEmail(email);
    if (!user || user?.provider !== "postgres") {
        console.error("User not found");
        return submission.reply({
            fieldErrors: {
                email: ["User not found"],
            },
        });
    }
    const passwordCorrect = await compare(password, user.password);
    if (!passwordCorrect) {
        console.error("Incorrect password");
        return submission.reply({
            fieldErrors: {
                password: ["Incorrect password"],
            },
        });
    }
    return submission.reply();
}
