"use client";

import { type VictimReport } from "$src/lib/types/api.types";
import { getCountryName } from "$src/lib/utils/country.utils";
import { Accordion, AccordionBody, AccordionHeader, Card } from "@tremor/react";
import { formatRelative } from "date-fns";
import { enGB } from "date-fns/locale";
import { useState } from "react";
import sanitizeHtml from "sanitize-html";
import SourceCodeButtons from "../Document/SourceCodeButtons";
import CopyButton from "../Utils/CopyButton";
import DownloadUmfButton from "./DownloadUmfButton";
import VictimEditButton from "./VictimEditButton";
import VictimScreenshotButton from "./VictimScreenshotButton";

type Props = {
    victim: VictimReport;
    umfData: Record<string, unknown>;
    media:
        | {
              image: number[];
              type: string;
          }
        | undefined;
};

function VictimData({ victim, umfData, media }: Props) {
    const [data, setData] = useState<VictimReport>(victim);
    const handleData = (newData: VictimReport) => {
        setData(newData);
    };

    const fullUrl = `${data.url.networkProtocol}://${data.url.domainName}${data.url.path}`;
    const labels: Record<string, string> = {
        Date: formatRelative(new Date(data.detectionDate.toISOString()), new Date(), { locale: enGB }),
        Perpetrator: data.ransomwareGroup ?? "-",
        Company: data.companyName ?? "-",
        Website: data.companyLink ?? "-",
        Address: data.victimAddress ?? "-",
        Country: data.country ? getCountryName(data.country) : "-",
    };

    const urlData: Record<string, string | null> = {
        Protocol: data.url.networkProtocol,
        Domain: data.url.domainName,
        Path: data.url.path,
        Signature: data.url.urlSignature,
        Network: data.url.network,
    };

    function isUrl(str: string | undefined): boolean {
        if (!str) {
            return false;
        }
        return str.startsWith("http://") || str.startsWith("https://") || str.startsWith("www.");
    }
    return (
        <Card className="relative flex flex-1 flex-col divide-y divide-black/20">
            <header className="flex flex-wrap items-center justify-between gap-4 pb-4">
                <h1 className="text-2xl font-semibold lg:text-3xl">
                    {data.pageTitle ?? data.companyName} - Incident Snapshot
                </h1>
                <div className="hidden flex-wrap items-center gap-2 pl-2 lg:flex">
                    <DownloadUmfButton name={data.pageTitle ?? data.companyName ?? data.id} umf={umfData} />
                    <VictimEditButton data={data} onSubmit={handleData} />
                </div>
            </header>
            <main className="flex flex-col gap-4 py-4">
                <div className="flex flex-col gap-4 lg:flex-row-reverse">
                    <div className="flex flex-1 flex-col gap-4">
                        <h2 className="text-xl font-semibold capitalize lg:text-2xl">Threat Discovery</h2>
                        <div className="flex flex-col gap-2">
                            <span className="break-words text-secondary">{fullUrl}</span>
                            <div className="flex flex-wrap gap-2">
                                <SourceCodeButtons route="victims" docId={data.id ?? data.id} />
                                {media && (
                                    <VictimScreenshotButton
                                        id={data.id}
                                        name={data.pageTitle ?? data.companyName ?? data.id}
                                        media={media}
                                    />
                                )}
                                <CopyButton value={fullUrl} />
                            </div>
                        </div>
                        <Accordion>
                            <AccordionHeader className="text-sm font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">
                                Url
                            </AccordionHeader>
                            <AccordionBody className="flex flex-col gap-2">
                                {Object.keys(urlData).map((key) => {
                                    return (
                                        <div className="flex items-baseline justify-start" key={`${key}Label`}>
                                            <div className="block min-w-24">
                                                <span className="font-bold uppercase">{key}</span>
                                            </div>
                                            <div className="flex w-full lg:justify-end">
                                                {urlData[key] ? (
                                                    <span className="break-words text-secondary">{urlData[key]}</span>
                                                ) : (
                                                    "-"
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </AccordionBody>
                        </Accordion>
                    </div>
                    <div className="flex flex-1 flex-col gap-4">
                        <h2 className="text-xl font-semibold capitalize lg:text-2xl">Threat Overview</h2>
                        <div className="flex flex-1 flex-col gap-2">
                            {Object.keys(labels).map((key) => {
                                return (
                                    <div className="flex items-baseline justify-start" key={`${key}Label`}>
                                        <div className="min-w-28">
                                            <span className="font-bold">{key}</span>
                                        </div>
                                        {isUrl(labels[key]) ? (
                                            <a
                                                href={labels[key]}
                                                target="_blank"
                                                className="block max-w-56 truncate sm:max-w-full"
                                            >
                                                {labels[key]}
                                            </a>
                                        ) : (
                                            <span className="block max-w-56 truncate text-secondary sm:max-w-full">
                                                {labels[key]?.length ? labels[key] : "-"}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </main>
            <footer className="flex flex-col gap-4 pt-4">
                <p
                    className="whitespace-pre-line break-words"
                    dangerouslySetInnerHTML={{
                        __html: sanitizeHtml(data.ransomwarePost ?? "No info about this victim", {
                            allowedTags: ["strong", "em", "a"],
                        }),
                    }}
                />
                <div className="flex flex-wrap items-center gap-2 lg:hidden">
                    <DownloadUmfButton name={data.pageTitle ?? data.companyName ?? data.id} umf={umfData} />
                    <VictimEditButton data={data} onSubmit={handleData} />
                </div>
            </footer>
        </Card>
    );
}

export default VictimData;
