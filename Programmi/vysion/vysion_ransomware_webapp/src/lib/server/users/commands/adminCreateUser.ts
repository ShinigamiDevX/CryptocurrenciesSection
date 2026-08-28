"use server";

import { CreateUserFormSchema } from "$lib/schemas/form.schemas";
import { getPrismaKnownErrors } from "$src/lib/utils/db.utils";
import { type SubmissionResult } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod";
import { UserRole } from "@prisma/client";
import { type PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { hash } from "bcrypt";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";
import { authOptions } from "../../auth/auth";
import { UsersRepository } from "../database/users.repository";

export async function adminCreateUserAction(prevState: unknown, formData: FormData): Promise<SubmissionResult> {
    const submission = parseWithZod(formData, { schema: CreateUserFormSchema });
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== UserRole.admin) {
        return submission.reply({
            fieldErrors: { email: ["Unauthorized"] },
        });
    }
    if (submission.status !== "success") {
        return submission.reply();
    }
    const { name, email, password, role } = submission.value;
    const hashedPassword = await hash(password, 10);
    const createdUser = await UsersRepository.createUser({
        name,
        email,
        password: hashedPassword,
        role,
    });
    if (createdUser.name === "PrismaClientKnownRequestError") {
        const errors = getPrismaKnownErrors((createdUser as PrismaClientKnownRequestError).meta?.target as string[]);
        return submission.reply({
            fieldErrors: errors,
        });
    }
    revalidatePath("/admin");
    return submission.reply();
}
