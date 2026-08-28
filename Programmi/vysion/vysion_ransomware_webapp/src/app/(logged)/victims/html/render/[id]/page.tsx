import DownloadHTMLButton from "$components/Document/DownloadHTMLButton";
import ErrorMessage from "$components/Utils/ErrorMessage";
import GoBackButton from "$components/Utils/GoBackButton";
import { getOneVictimAction } from "$lib/server/ransomware/queries/getOneVictim";
import { getVictimSource } from "$lib/server/ransomware/queries/getVictimSource";
import { Card } from "@tremor/react";
import { type Metadata } from "next";
import { notFound } from "next/navigation";

type Props = {
    params: { id: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const res = await getOneVictimAction(params.id);
    if (!res.success) {
        notFound();
    }
    return {
        title: `${res.data.pageTitle ?? res.data.companyName} - Threat Render Visualization`,
    };
}

export default async function VictimRender({ params }: { params: { id: string } }) {
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

    return (
        <main className="flex h-full w-full flex-col gap-4">
            <Card className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                    <GoBackButton url={`/victims/${params.id}`} size="md" tooltip="Go to victim's page" />
                    <h1 className="text-xl font-semibold lg:text-3xl">
                        {data.pageTitle ?? data.companyName} - Threat Render Visualization
                    </h1>
                </div>
            </Card>
            {victimReport.html ? (
                <div className="relative flex flex-1 flex-col gap-4">
                    <DownloadHTMLButton docId={params.id} HTML={victimReport.html} />

                    <div className="h-full w-full">
                        <iframe
                            className="border-0"
                            width="100%"
                            height="100%"
                            title="html_render"
                            src={`data:text/html,${encodeURIComponent(victimReport.html)}`}
                        />
                    </div>
                </div>
            ) : (
                <div>No HTML to render</div>
            )}
        </main>
    );
}
