"use client";

import { searchVictimsAction } from "$lib/server/search/queries/searchVictims";
import { type VictimReport } from "$lib/types/api.types";
import { type SearchDto } from "$lib/types/dto.types";
import { getCountryAsOptions } from "$src/lib/utils/country.utils";
import { concatQueryParams, getQueryParams, getUrlQueryParams } from "$src/lib/utils/queries.utils";
import { ArrowRightIcon, SearchIcon } from "@heroicons/react/outline";
import { Icon, MultiSelect, MultiSelectItem, TextInput, Title } from "@tremor/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "react-hot-toast";
import VictimsTable from "../Tables/VictimsTable";

type Props = {
    route: string;
    group?: string;
};

function VictimsCardContainer({ route, group }: Props) {
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const router = useRouter();

    const [searchFilters, setSearchFilters] = useState<Partial<SearchDto>>(
        getQueryParams<Partial<SearchDto>>(searchParams)
    );

    useEffect(() => {
        setSearchFilters(getQueryParams<Partial<SearchDto>>(searchParams));
    }, [searchParams]);

    const [tableData, setTableData] = useState<VictimReport[]>([]);
    const [loadingData, startTransition] = useTransition();

    const [totalPages, setTotalPages] = useState(1);

    const updateUrlParams = (params: Record<string, number | string | string[]>) => {
        const oldParams = new URLSearchParams(searchParams);
        Object.keys(params).forEach((key) => oldParams.delete(key));
        const newParams = getUrlQueryParams(params);
        const allParams = concatQueryParams(oldParams, newParams);
        setSearchFilters(getQueryParams<Partial<SearchDto>>(allParams));
        router.replace(`${pathname}?${allParams.toString()}`, { scroll: false });
    };

    const updatePage = (currentPage: number) => {
        const params = new URLSearchParams({ ...searchFilters, page: currentPage } as unknown as Record<
            string,
            string
        >);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const findData = useCallback(() => {
        async function getDocuments() {
            const res = await searchVictimsAction(searchFilters, group);
            if (!res.success) {
                toast.error(res.errorMessage);
                throw new Error(res.errorMessage);
            }
            setTableData(res.data.hits);
            setTotalPages(res.data.total);
        }
        getDocuments().catch((e: string) => {
            toast.error(e);
        });
    }, [searchFilters, group]);

    useEffect(() => {
        startTransition(() => {
            findData();
        });
    }, [findData, searchParams]);

    return (
        <article className={"flex h-fit flex-grow flex-col rounded-lg border bg-white print:hidden"}>
            <header className="flex min-h-[var(--size-table-title)] flex-col justify-between gap-2 px-4 py-2 sm:flex-row sm:items-center sm:gap-4 print:hidden">
                {group ? (
                    <Title>
                        Victims of <strong>{group}</strong>
                    </Title>
                ) : (
                    <Title>Victims</Title>
                )}
                {!group ? (
                    <TextInput
                        icon={SearchIcon}
                        type={"search" as "text" | "password" | "email" | "url" | undefined} // Otherwise compiler complains
                        defaultValue={searchFilters.q}
                        placeholder="Search for a group, victim or keyword"
                        onChange={(e) =>
                            updateUrlParams({
                                ...searchFilters,
                                q: e.target.value,
                                page: 1,
                            })
                        }
                        className="h-[2.375rem] flex-1 rounded-lg border border-gray-300 text-sm placeholder:italic placeholder:text-black/50"
                    />
                ) : null}
                <MultiSelect
                    className="sm:max-w-60"
                    placeholder="Select countries"
                    defaultValue={
                        searchFilters?.c
                            ? Array.isArray(searchFilters.c)
                                ? searchFilters.c
                                : [searchFilters.c]
                            : undefined
                    }
                    onValueChange={(values) => updateUrlParams({ c: values })}
                >
                    {getCountryAsOptions().map((option, index) => (
                        <MultiSelectItem key={`country-option-${index}`} value={option.value}>
                            {option.label}
                        </MultiSelectItem>
                    ))}
                </MultiSelect>
                {!group && route !== "victims" ? (
                    <Link href={"/victims"} className="flex flex-shrink-0 items-center">
                        See all
                        <Icon icon={ArrowRightIcon} size="md" className="text-accent" />
                    </Link>
                ) : null}
            </header>
            <VictimsTable
                currentPage={searchFilters.page ?? 1}
                group={group}
                loading={loadingData}
                query={searchFilters.q ?? undefined}
                totalPages={totalPages}
                tableData={tableData}
                onPageChange={updatePage}
            />
        </article>
    );
}

export default VictimsCardContainer;
