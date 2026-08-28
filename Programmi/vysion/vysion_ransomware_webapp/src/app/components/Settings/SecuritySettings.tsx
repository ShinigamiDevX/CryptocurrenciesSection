"use client";

import { Button, Title } from "@tremor/react";
import { useState } from "react";
import ResetSecondFactorForm from "./ResetSecondFactorForm";
import UpdatePasswordForm from "./UpdatePasswordForm";

type Props = {
    disabled: boolean;
};

export default function SecuritySettings({ disabled }: Props) {
    const [reset2faDisabled, setReset2faDisabled] = useState(false);
    const [updatingPassword, setUpdatingPassword] = useState(false);
    return (
        <div className="flex flex-col gap-8">
            <Title>Security Settings</Title>
            <div className="flex w-fit flex-col gap-2">
                {updatingPassword ? <UpdatePasswordForm setUpdatingPassword={setUpdatingPassword} /> : null}
                <Button
                    className="w-64"
                    color={updatingPassword ? "red" : "amber"}
                    onClick={() => {
                        setUpdatingPassword(!updatingPassword);
                    }}
                    disabled={reset2faDisabled || disabled}
                    title="Change your password"
                >
                    {updatingPassword ? "Cancel" : "Change Password"}
                </Button>
                {!updatingPassword ? (
                    <ResetSecondFactorForm
                        disabled={reset2faDisabled || disabled}
                        setReset2faDisabled={setReset2faDisabled}
                    />
                ) : null}
            </div>
        </div>
    );
}
