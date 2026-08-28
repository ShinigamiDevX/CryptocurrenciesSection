"use client";

import { type ReportQuery } from "$lib/types/api.types";
import { getCountryAsOptions } from "$lib/utils/country.utils";
import { concatQueryParams, getQueryParams, getUrlQueryParams } from "$lib/utils/queries.utils";
import { getReportInfoAsOptions } from "$lib/utils/report.utils";
import { AdjustmentsIcon, XIcon } from "@heroicons/react/solid";
import { Button, Card, DatePicker, Divider, MultiSelect, MultiSelectItem, type DatePickerValue } from "@tremor/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";

type Props = {
    pdfRef: React.RefObject<HTMLDivElement>;
};

const DashboardReportExporter = ({ pdfRef }: Props) => {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();

    const filterRef = useRef<HTMLDivElement>(null);
    const [filterOpen, setFilterOpen] = useState(false);
    const [urlQueries, setUrlQueries] = useState<ReportQuery>(getQueryParams<ReportQuery>(searchParams));

    const selectFileId = "select-file-type";

    const updateUrlParams = (params: Record<string, string | string[]>) => {
        const oldParams = new URLSearchParams(searchParams);
        Object.keys(params).forEach((key) => oldParams.delete(key));
        const newParams = getUrlQueryParams(params);
        const allParams = concatQueryParams(oldParams, newParams);
        setUrlQueries(getQueryParams<ReportQuery>(allParams));
        router.replace(`${pathname}?${allParams.toString()}`);
    };

    const handleFilterToggle = () => setFilterOpen((prev) => !prev);
    const handleGenerateReport = useReactToPrint({
        documentTitle: `report-${new Date().getTime()}`,
        copyStyles: true,
        removeAfterPrint: true,
        content: () => pdfRef.current,
    });

    const handleStartDateChange = (value: DatePickerValue) => {
        const iso = value?.toISOString().split("T")[0] ?? "";
        updateUrlParams({ start: iso });
    };

    const handleEndDateChange = (value: DatePickerValue) => {
        const iso = value?.toISOString().split("T")[0] ?? "";
        updateUrlParams({ end: iso });
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterOpen && filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setFilterOpen(false);
            }
        };

        document.addEventListener("click", handleClickOutside);

        return () => document.removeEventListener("click", handleClickOutside);
    }, [filterOpen]);

    useEffect(() => {
        const selectFileType = document.getElementById(selectFileId);
        if (selectFileType) {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === "attributes" && mutation.attributeName === "data-headlessui-state") {
                        const isOpen = (mutation.target as Element).getAttribute("data-headlessui-state") === "open";
                        if (isOpen) {
                            requestAnimationFrame(() => {
                                const selectList = selectFileType.lastChild as HTMLElement;
                                if (selectList) {
                                    const isSmBreakpoint = window.matchMedia("(min-width: 640px)").matches;
                                    selectList.style.bottom = isSmBreakpoint ? "auto" : "100%";
                                }
                            });
                        }
                    }
                });
            });

            observer.observe(selectFileType, { attributes: true });
            return () => observer.disconnect();
        }
    }, []);

    return (
        <section className="flex-1 print:hidden">
            <Card className="!overflow-visible bg-tremor-background-subtle p-4">
                <div>
                    <div className="flex items-center justify-between gap-4 sm:hidden">
                        <h2 className="text-lg font-semibold">Generate Report</h2>
                        <Button
                            type="button"
                            className="p-2"
                            icon={AdjustmentsIcon}
                            size="sm"
                            onClick={handleFilterToggle}
                        />
                    </div>
                    <div
                        className={`fixed left-0 ${filterOpen ? "top-0" : "top-[100svh]"} sm:lef-[unset] z-20 flex h-svh w-svw flex-col bg-black/80 pt-24 sm:relative sm:!top-[unset] sm:h-auto sm:w-full sm:bg-transparent sm:pt-0`}
                    >
                        <div
                            ref={filterRef}
                            className="flex flex-1 flex-col gap-6 rounded-t-xl bg-white p-6 sm:rounded-none sm:bg-transparent sm:p-0"
                        >
                            <header className="flex items-center justify-between sm:hidden">
                                <h2 className="text-lg font-semibold">Filter Report</h2>
                                <Button
                                    type="button"
                                    className="p-2"
                                    icon={XIcon}
                                    size="xs"
                                    variant="secondary"
                                    onClick={handleFilterToggle}
                                />
                            </header>
                            <Divider className="m-0 sm:hidden" />
                            <main className="relative flex flex-1 flex-col gap-5 sm:gap-2 xl:flex-row">
                                <div className="flex flex-col gap-5 sm:flex-row sm:gap-2 xl:flex-1">
                                    <div className="flex flex-col gap-2 sm:flex-1 sm:shrink-0">
                                        <span className="flex flex-1 items-center">Country</span>
                                        <MultiSelect
                                            placeholder="Select countries"
                                            defaultValue={
                                                urlQueries?.country
                                                    ? Array.isArray(urlQueries.country)
                                                        ? urlQueries.country
                                                        : [urlQueries.country]
                                                    : undefined
                                            }
                                            onValueChange={(values) => updateUrlParams({ country: values })}
                                        >
                                            {getCountryAsOptions().map((option, index) => (
                                                <MultiSelectItem key={`country-option-${index}`} value={option.value}>
                                                    {option.label}
                                                </MultiSelectItem>
                                            ))}
                                        </MultiSelect>
                                    </div>
                                    <div className="flex flex-col gap-2 sm:flex-1 sm:shrink-0">
                                        <span className="flex flex-1 items-center">Report information</span>
                                        <MultiSelect
                                            placeholder="Select information"
                                            defaultValue={
                                                urlQueries?.info
                                                    ? Array.isArray(urlQueries.info)
                                                        ? urlQueries.info
                                                        : [urlQueries.info]
                                                    : undefined
                                            }
                                            onValueChange={(values) => updateUrlParams({ info: values })}
                                        >
                                            {getReportInfoAsOptions().map((info, index) => (
                                                <MultiSelectItem key={`info-option-${index}`} value={info.value}>
                                                    {info.label}
                                                </MultiSelectItem>
                                            ))}
                                        </MultiSelect>
                                    </div>
                                </div>
                                <div className="flex flex-1 flex-col gap-5 sm:flex-row sm:gap-2 xl:flex-none">
                                    <div className="flex flex-col gap-2 sm:flex-1 sm:shrink-0 xl:flex-none">
                                        <span className="flex flex-1 items-center">Start date</span>
                                        <DatePicker
                                            defaultValue={urlQueries?.start ? new Date(urlQueries.start) : undefined}
                                            onValueChange={handleStartDateChange}
                                            maxDate={new Date(new Date(new Date().setDate(new Date().getDate() - 1)))}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-2 sm:flex-1 sm:shrink-0 xl:flex-none">
                                        <div className="flex flex-1 items-center gap-2">
                                            <span className="flex">End date</span>
                                            <span className="text-xs italic sm:mb-2">(optional)</span>
                                        </div>
                                        <DatePicker
                                            defaultValue={urlQueries?.end ? new Date(urlQueries.end) : undefined}
                                            onValueChange={handleEndDateChange}
                                            maxDate={new Date(new Date(new Date().setDate(new Date().getDate() + 1)))}
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-1 flex-col justify-end gap-2 xl:flex-none">
                                    <Divider className="mx-0 my-5 sm:hidden" />
                                    <Button
                                        type="button"
                                        className="h-fit w-full sm:w-fit sm:self-end"
                                        onClick={handleGenerateReport}
                                    >
                                        Generate Report
                                    </Button>
                                </div>
                            </main>
                        </div>
                    </div>
                </div>
            </Card>
        </section>
    );
};

export default DashboardReportExporter;
