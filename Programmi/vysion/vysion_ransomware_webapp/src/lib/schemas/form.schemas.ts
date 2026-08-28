import { UserRole } from "@prisma/client";
import { z } from "zod";

export const NameSchema: z.ZodSchema<string> = z.string().min(1, { message: "Name is required" });
export const EmailSchema: z.ZodSchema<string> = z
    .string()
    .min(1, { message: "Email is required" })
    .email({ message: "Invalid email address" });
//1 number, 1 special char, 1 uppercase, 1 lowercase
// allow ^$*.[]{}()?-"!@#%&\/,><':;|_~`+=
export const PasswordSchema: z.ZodSchema<string> = z
    .string()
    .min(1, { message: "Password is required" })
    .min(8, { message: "Password must be at least 8 characters long" })
    .refine((password) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z\d])\S*$/g.test(password), {
        message:
            "Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character",
    });

export const TotpSchema: z.ZodSchema<string> = z.string().length(6).regex(/^\d+$/);

export const UserRoleSchema: z.ZodNativeEnum<typeof UserRole> = z.nativeEnum(UserRole);

export const LoginFormSchema = z.object({
    email: EmailSchema,
    password: PasswordSchema,
});

export const LdapFormSchema = z.object({
    username: z.string(),
    password: z.string().min(1, { message: "Password is required" }),
});

export const ForgotPasswordFormSchema = z.object({
    encryptedTotp: z.string(),
    email: EmailSchema,
    submmittedTotp: TotpSchema,
    newPassword: PasswordSchema,
    confirmPassword: PasswordSchema,
});

export const UpdatePasswordFormSchema = z.object({
    oldPassword: PasswordSchema,
    newPassword: PasswordSchema,
    confirmPassword: PasswordSchema,
});

export const CreateUserFormSchema = z.object({
    name: NameSchema,
    email: EmailSchema,
    password: PasswordSchema,
    role: UserRoleSchema,
});
