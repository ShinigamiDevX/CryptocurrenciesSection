import DownloadHTMLButton from "$components/Document/DownloadHTMLButton";
import ErrorMessage from "$components/Utils/ErrorMessage";
import GoBackButton from "$components/Utils/GoBackButton";
import { getOneVictimAction } from "$lib/server/ransomware/queries/getOneVictim";
import { getVictimSource } from "$lib/server/ransomware/queries/getVictimSource";
import { Card } from "@tremor/react";
import { type Metadata } from "next";
import { notFound } from "next/navigation";
import pretty from "pretty";
import SyntaxHighlighter from "react-syntax-highlighter";
import { atomOneDark } from "react-syntax-highlighter/dist/esm/styles/hljs";

type Props = {
    params: { id: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const res = await getOneVictimAction(params.id);
    if (!res.success) {
        notFound();
    }
    return {
        title: `${res.data.pageTitle ?? res.data.companyName} - Threat Source Visualization`,
    };
}

export default async function VictimHTML({ params }: Props) {
    const res = await getOneVictimAction(params.id);
    if (!res.success) {
        return <ErrorMessage>{res.errorMessage}</ErrorMessage>;
    }
    const { data } = res;

    const resSource = await getVictimSource(params.id);
    if (!resSource.success) {
        console.error(resSource.errorMessage);
        return <ErrorMessage>{resSource.errorMessage}</ErrorMessage>;
    }
    const victimReport = resSource.data;
    const formattedSource = pretty(victimReport.html);

    return (
        <main className="flex flex-col gap-4">
            <Card className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                    <GoBackButton url={`/victims/${params.id}`} size="md" tooltip="Go to victim's page" />
                    <h1 className="text-xl font-semibold lg:text-3xl">
                        {data.pageTitle ?? data.companyName} - Threat Source Visualization
                    </h1>
                </div>
            </Card>
            {victimReport.html ? (
                <div className="relative flex h-full w-full flex-col gap-4">
                    <DownloadHTMLButton HTML={victimReport.html} docId={params.id} />
                    <SyntaxHighlighter language="html" style={atomOneDark} showLineNumbers>
                        {formattedSource}
                    </SyntaxHighlighter>
                </div>
            ) : (
                <div>No Source code to render</div>
            )}
        </main>
    );
}
