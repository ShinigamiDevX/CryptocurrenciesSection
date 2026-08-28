import { resetSecondFactorAction } from "$lib/server/users/commands/resetSecondFactor";
import { Button } from "@tremor/react";
import { signOut } from "next-auth/react";
import { useEffect } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { toast } from "react-hot-toast";

export default function ResetSecondFactorForm({
    disabled,
    setReset2faDisabled,
}: {
    disabled: boolean;
    setReset2faDisabled: (value: boolean) => void;
}) {
    const [reset2faState, resetSecondFactorFormAction] = useFormState(resetSecondFactorAction, undefined);

    useEffect(() => {
        if (!reset2faState) return;
        if (!reset2faState.success && reset2faState.errorMessage) {
            toast.error(reset2faState.errorMessage);
            console.error(reset2faState.errorMessage);
            return;
        }
        setReset2faDisabled(true);
        toast.success("2FA successfully reset, please log in again");
        // wait 2s before logging out
        setTimeout(() => {
            signOut().catch((e) => {
                console.error("Error logging out", e);
                toast.error("Error logging out");
            });
        }, 2000);
    }, [reset2faState, setReset2faDisabled]);

    return (
        <form action={resetSecondFactorFormAction}>
            <ResetSecondFactorButton />
        </form>
    );

    function ResetSecondFactorButton() {
        const { pending } = useFormStatus();
        return (
            <Button
                disabled={disabled || pending}
                className="w-64"
                color="red"
                title="Reset second factor authentication"
                type="submit"
            >
                Reset 2FA
            </Button>
        );
    }
}
