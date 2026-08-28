"use client";

import useSortableTable from "$hooks/useSortableTable";
import { type TableColumn, type TableData } from "$src/lib/types/table.types";
import TableBody from "./TableBody";
import TableHead from "./TableHead";

type Props<T = string | number> = {
    columns: TableColumn[];
    data: TableData<T>[];
    className?: string;
};

export default function SortableTable<T = string | number>({ columns, data, className }: Props<T>) {
    const [tableData, handleSorting] = useSortableTable(data, columns);
    return (
        <table className="relative w-full border-separate">
            <TableHead {...{ columns, handleSorting }} />
            <TableBody {...{ columns, tableData, className }} />
        </table>
    );
}
