import {
    type TableAccessor,
    type TableColumn,
    type TableData,
    type TableHookResult,
    type TableOrder,
} from "$lib/types/table.types";
import { type ReactElement, useEffect, useState } from "react";

function getDefaultSorting<T = string | number>(data: TableData<T>[], columns: TableColumn[]) {
    const sorted = [...data].sort((a, b) => {
        const filterColumn = columns.filter((column) => column.order);
        const { accessor = "id", order = "asc" } = filterColumn[0] ?? {};
        if (a[accessor] === null) {
            return 1;
        }
        if (b[accessor] === null) {
            return -1;
        }
        if (a[accessor] === null && b[accessor] === null) {
            return 0;
        }
        const ascending =
            a[accessor]?.toString().localeCompare(b[accessor]?.toString() ?? "", "en", { numeric: true }) ?? 0;
        return order === "asc" ? ascending : ascending * -1;
    });
    return sorted;
}

function useSortableTable<T = string | number>(data: TableData<T>[], columns: TableColumn[]): TableHookResult<T> {
    const [tableData, setTableData] = useState(getDefaultSorting(data, columns));
    useEffect(() => {
        setTableData(data);
    }, [data]);

    const handleSorting = (sortField: TableAccessor, sortOrder: TableOrder) => {
        if (sortField) {
            const sorted = [...tableData].sort((a, b) => {
                const aField =
                    typeof a[sortField] === "string" || typeof a[sortField] === "number"
                        ? a[sortField]
                        : (a[sortField] as ReactElement)?.key;
                const bField =
                    typeof b[sortField] === "string" || typeof b[sortField] === "number"
                        ? b[sortField]
                        : (b[sortField] as ReactElement)?.key;
                if (aField === null) {
                    return 1;
                }
                if (bField === null) {
                    return -1;
                }
                if (aField === null && bField === null) {
                    return 0;
                }
                return (
                    (aField?.toString() ?? "").localeCompare(bField?.toString() ?? "", "en", {
                        numeric: true,
                    }) * (sortOrder === "asc" ? 1 : -1)
                );
            });
            setTableData(sorted);
        }
    };
    return [tableData, handleSorting];
}

export default useSortableTable;
