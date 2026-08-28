import { Card, Title } from "@tremor/react";
import { type Metadata } from "next";

const licenses: Record<string, string> = {
    "Creative tim": "https://github.com/creativetimofficial/notus-nextjs/blob/main/LICENSE.md",
    "NextAuth.js": "https://github.com/nextauthjs/next-auth/blob/main/LICENSE",
    "React Simple Maps": "https://github.com/zcreativelabs/react-simple-maps/blob/main/LICENSE",
    "Next.js": "https://github.com/vercel/next.js/blob/canary/license.md",
    Tailwindcss: "https://github.com/tailwindlabs/tailwindcss/blob/master/LICENSE",
    Tremor: "https://github.com/tremorlabs/tremor/blob/main/License",
};

export const metadata: Metadata = {
    title: "Licenses",
};

export default function Licenses() {
    return (
        <Card className="h-full">
            <Title>Licenses</Title>
            <ul className="mt-4 flex list-disc flex-col gap-2 px-4">
                {Object.keys(licenses).map((key) => {
                    return (
                        <li key={`${key}Label`}>
                            <a href={licenses[key]} target="_blank">
                                {key}
                            </a>
                        </li>
                    );
                })}
            </ul>
        </Card>
    );
}
