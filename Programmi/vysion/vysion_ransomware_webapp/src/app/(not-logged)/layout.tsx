import { Divider } from "@tremor/react";
import Image from "next/image";
import Link from "next/link";
import vysionLogo from "public/images/logo_vysion_ransomware_color.png";
import { type ReactNode } from "react";

export const metadata = {
    title: "Login",
};

export default function LoggedOutLayout({ children }: { children: ReactNode }) {
    return (
        <main className="flex h-svh w-screen items-center justify-center bg-gradient-to-r from-tremor-brand to-sidebar">
            <div className="flex w-[500px] flex-col items-center justify-center gap-4 rounded-xl border-2 border-white bg-background-secondary px-16 py-8 text-primary shadow-xl">
                <Link className="flex items-center justify-center" href="/login">
                    <Image src={vysionLogo} alt="Eactda" width={240} height={240} />
                </Link>
                <Divider className="w-full" />
                {children}
            </div>
        </main>
    );
}
