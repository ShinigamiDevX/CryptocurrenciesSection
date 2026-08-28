import React from "react";

export default function ErrorMessage({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative mb-4 rounded-lg bg-red-400 px-6 py-4 text-sm font-bold text-white">
            <span className="mr-8 text-base">{children}</span>
        </div>
    );
}
