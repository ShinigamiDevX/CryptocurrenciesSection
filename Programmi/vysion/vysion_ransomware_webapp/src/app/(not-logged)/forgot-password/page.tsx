import ForgotPasswordForm from "$components/Login/ForgotPasswordForm";
import Loading from "$src/app/components/Utils/Loading";
import { Suspense } from "react";

export default function ForgotPasswordPage() {
    return (
        <Suspense fallback={<div className="w-full h-60"><Loading /></div>}>
            <ForgotPasswordForm />
        </Suspense>
    );
}
