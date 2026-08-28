"use client";

import { UpdatePasswordFormSchema } from "$lib/schemas/form.schemas";
import { updateUserPasswordAction } from "$lib/server/users/commands/updateUserPassword";
import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod";
import { Button, Subtitle, TextInput } from "@tremor/react";
import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "react-hot-toast";

export default function UpdatePasswordForm({ setUpdatingPassword }: { setUpdatingPassword: (value: boolean) => void }) {
    const [lastResult, formAction] = useFormState(updateUserPasswordAction, undefined);
    const [form, fields] = useForm({
        lastResult,
        onValidate({ formData }) {
            return parseWithZod(formData, { schema: UpdatePasswordFormSchema });
        },
        shouldValidate: "onSubmit",
        shouldRevalidate: "onInput",
    });

    useEffect(() => {
        if (lastResult?.status !== "success") return;
        toast.success("Password updated successfully");
        setUpdatingPassword(false);
    }, [lastResult, setUpdatingPassword]);

    return (
        <form className="flex flex-col gap-4" {...getFormProps(form)} action={formAction}>
            <Subtitle>Update your password</Subtitle>
            <TextInput
                error={!fields.oldPassword.valid}
                errorMessage={fields.oldPassword.errors?.[0]}
                name={fields.oldPassword.name}
                type="password"
                placeholder="Old password"
                className="w-64"
                required
            />
            <TextInput
                error={!fields.newPassword.valid}
                errorMessage={fields.newPassword.errors?.[0]}
                name={fields.newPassword.name}
                type="password"
                placeholder="New password"
                className="w-64"
                required
            />
            <TextInput
                error={!fields.confirmPassword.valid}
                errorMessage={fields.confirmPassword.errors?.[0]}
                name={fields.confirmPassword.name}
                type="password"
                placeholder="Confirm password"
                className="w-64"
                required
            />
            <SubmitButton />
        </form>
    );

    function SubmitButton() {
        const { pending } = useFormStatus();
        return (
            <Button
                type="submit"
                className="w-64"
                disabled={pending || form.status === "error"}
                title="Update Password"
            >
                Update Password
            </Button>
        );
    }
}
