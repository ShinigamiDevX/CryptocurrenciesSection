"use client";

import Pagination from "$components/Tables/Pagination";
import { type VictimReport } from "$lib/types/api.types";
import { getCountryName } from "$lib/utils/country.utils";
import { formatRelative } from "date-fns";
import { enGB } from "date-fns/locale";
import Link from "next/link";
import Loading from "../Utils/Loading";

type Props = {
    loading: boolean;
    group: string | undefined;
    query: string | undefined;
    tableData: VictimReport[];
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
};

export default function VictimsTable({
    loading,
    group,
    query,
    tableData,
    currentPage,
    totalPages,
    onPageChange,
}: Props) {
    const LoadingResults = () => {
        const numberRows = Array.from({ length: 10 }, (_, index) => index);
        const numberColumns = Array.from({ length: 5 }, (_, index) => index);
        return numberRows.map((_, index) => (
            <tr key={`${index}tr`} className="table w-full table-fixed border-b bg-white hover:bg-background-secondary">
                {numberColumns.map((_, index) => (
                    <td key={index} className="px-6 py-4">
                        <div className="h-[18px] w-[75px]">
                            <Loading />
                        </div>
                    </td>
                ))}
            </tr>
        ));
    };

    return (
        <main className="flex flex-1 flex-col">
            <div className="flex-1 overflow-x-auto">
                <table className="bg-white text-left text-sm text-gray-500">
                    <thead className="table h-[var(--size-table-thread)] w-full table-fixed border-y bg-background-secondary py-3 text-xs uppercase text-gray-700">
                        <tr>
                            <th scope="col" className="w-[200px] px-4">
                                Publication Date
                            </th>
                            <th scope="col" className="w-[200px] px-4">
                                Threat Group
                            </th>
                            <th scope="col" className="w-[200px] px-4">
                                Company
                            </th>
                            <th scope="col" className="w-[200px] px-4">
                                Country
                            </th>
                            <th scope="col" className="w-[200px] px-4">
                                Victim Website
                            </th>
                        </tr>
                    </thead>

                    <tbody className="block h-[calc(var(--size-table)-272px)] w-full overflow-auto">
                        {loading ? (
                            <LoadingResults />
                        ) : !tableData.length ? (
                            <tr className="flex h-full items-center justify-center">
                                {(group ?? query) ? (
                                    <td>
                                        No results found for <strong>{group ?? query}</strong>
                                    </td>
                                ) : (
                                    <td>No results found</td>
                                )}
                            </tr>
                        ) : (
                            tableData?.map((doc) => {
                                return (
                                    <tr className="table w-full table-fixed border-b" key={doc.id}>
                                        <td className="px-5 py-4">
                                            {doc.detectionDate ? (
                                                <span title={doc.detectionDate.toISOString()} className="capitalize">
                                                    {formatRelative(
                                                        new Date(doc.detectionDate.toISOString()),
                                                        new Date(),
                                                        { locale: enGB }
                                                    )}
                                                </span>
                                            ) : (
                                                "-"
                                            )}
                                        </td>
                                        <td>
                                            <Link
                                                href={`/groups/${doc.ransomwareGroup}?q="${doc.ransomwareGroup}"`}
                                                title={doc.ransomwareGroup ?? "Unknown"}
                                                className="block px-5 py-4 hover:bg-background-secondary"
                                            >
                                                {doc.ransomwareGroup}
                                            </Link>
                                        </td>
                                        <td>
                                            <Link
                                                // href={`/victims/${doc.sha256sum ?? doc.id}`}
                                                href={`/victims/${doc.id}`}
                                                title={doc.companyName ?? undefined}
                                                key={doc.sha256sum ?? doc.id}
                                                className="block w-full truncate px-5 py-4 hover:bg-background-secondary"
                                            >
                                                {doc.companyName ?? "-"}
                                            </Link>
                                        </td>
                                        <td className="truncate px-5 py-4">
                                            <span
                                                title={
                                                    doc.country ? getCountryName(doc.country.toUpperCase()) : undefined
                                                }
                                                className="truncate"
                                            >
                                                {doc.country ? getCountryName(doc.country.toUpperCase()) : "-"}
                                            </span>
                                        </td>
                                        <td>
                                            {doc.companyLink ? (
                                                <Link
                                                    href={`${doc.companyLink.includes("http") ? doc.companyLink : `http://${doc.companyLink}`}`}
                                                    title={doc.companyLink}
                                                    rel="noopener noreferrer"
                                                    target="_blank"
                                                    className="block truncate px-5 py-4 hover:bg-background-secondary"
                                                >
                                                    {doc.companyLink}
                                                </Link>
                                            ) : (
                                                <span className="px-5 py-4">-</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
            {totalPages > 1 && (
                <div className="flex items-center border-t bg-background-secondary py-2">
                    <Pagination
                        currentPage={Number(currentPage)}
                        totalCount={totalPages}
                        pageSize={10}
                        onPageChange={onPageChange}
                    />
                </div>
            )}
        </main>
    );
}
