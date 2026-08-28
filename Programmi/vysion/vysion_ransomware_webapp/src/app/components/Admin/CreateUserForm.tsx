"use client";

import { CreateUserFormSchema } from "$lib/schemas/form.schemas";
import { adminCreateUserAction } from "$lib/server/users/commands/adminCreateUser";
import { generatePassword } from "$lib/utils/crypto.utils";
import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod";
import { PlusCircleIcon, SparklesIcon } from "@heroicons/react/outline";
import { UserRole } from "@prisma/client";
import { Button, Dialog, DialogPanel, Icon, Select, SelectItem, TextInput } from "@tremor/react";
import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "react-hot-toast";

export default function CreateUserForm() {
    const [lastResult, formAction] = useFormState(adminCreateUserAction, undefined);
    const [form, fields] = useForm({
        lastResult,
        onValidate({ formData }) {
            return parseWithZod(formData, { schema: CreateUserFormSchema });
        },
        shouldValidate: "onSubmit",
        shouldRevalidate: "onInput",
    });
    const [creatingUser, setCreatingUser] = useState(false);
    const [password, setPassword] = useState("");

    useEffect(() => {
        if (lastResult?.status !== "success") return;
        toast.success("User created successfully");
        setPassword("");
        setCreatingUser(false);
    }, [lastResult]);

    function startCreateUser() {
        setCreatingUser(true);
    }

    function cancelCreateUser() {
        form.reset();
        setCreatingUser(false);
    }

    return (
        <div className="flex w-full flex-1 items-end justify-end gap-4 px-4 pb-4">
            <Button
                className="flex h-fit items-center justify-center"
                title="Create User"
                color="green"
                onClick={startCreateUser}
                icon={PlusCircleIcon}
                type="button"
            >
                Create User
            </Button>
            <Dialog open={creatingUser} onClose={cancelCreateUser}>
                <DialogPanel>
                    <header className="mb-6">
                        <h3 className="text-center text-lg font-semibold">Create User</h3>
                    </header>
                    <form className="flex w-full flex-col gap-4" {...getFormProps(form)} action={formAction}>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <div className="flex flex-1 flex-col gap-2">
                                <label className="text-sm font-semibold" htmlFor={fields.name.name}>
                                    Name
                                </label>
                                <TextInput
                                    name={fields.name.name}
                                    error={!fields.name.valid}
                                    errorMessage={fields.name.errors?.[0]}
                                    className="h-[38px]"
                                    type="text"
                                    placeholder="Enter name"
                                    required
                                />
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-semibold" htmlFor={fields.role.name}>
                                    Role
                                </label>
                                <Select
                                    name={fields.role.name}
                                    error={!fields.role.valid}
                                    errorMessage={fields.role.errors?.[0]}
                                    placeholder="Select role"
                                    required
                                >
                                    {Object.values(UserRole).map((role) => (
                                        <SelectItem key={role} value={role}>
                                            {role}
                                        </SelectItem>
                                    ))}
                                </Select>
                            </div>
                        </div>
                        <div className="flex flex-1 flex-col gap-2">
                            <label className="text-sm font-semibold" htmlFor={fields.email.name}>
                                Email
                            </label>
                            <TextInput
                                name={fields.email.name}
                                error={!fields.email.valid}
                                errorMessage={fields.email.errors?.[0]}
                                className="h-[38px]"
                                type="email"
                                placeholder="Enter email address"
                                required
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-sm font-semibold" htmlFor={fields.password.name}>
                                Password
                            </label>
                            <div className="relative">
                                <TextInput
                                    name={fields.password.name}
                                    error={!fields.password.valid}
                                    errorMessage={fields.password.errors?.[0]}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="h-[38px]"
                                    type="password"
                                    placeholder="Enter new password"
                                    required
                                />
                                <button
                                    title="Generate Password"
                                    className="absolute right-10 top-2"
                                    type="button"
                                    onClick={() => setPassword(generatePassword())}
                                >
                                    <Icon
                                        className="p-0 text-tremor-content-subtle hover:text-tremor-content"
                                        size="md"
                                        color="slate"
                                        icon={SparklesIcon}
                                    />
                                </button>
                            </div>
                        </div>
                        <SubmitButton />
                    </form>
                </DialogPanel>
            </Dialog>
        </div>
    );
}

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button className="mt-4" type="submit" icon={PlusCircleIcon} loading={pending}>
            Create new User
        </Button>
    );
}
