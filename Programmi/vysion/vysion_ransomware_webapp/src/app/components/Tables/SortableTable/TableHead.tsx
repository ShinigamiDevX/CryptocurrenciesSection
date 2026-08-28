import {
    type TableAccessor,
    type TableColumn,
    type TableHandleSorting,
    type TableOrder,
} from "$src/lib/types/table.types";
import { cn } from "$src/lib/utils/class.utils";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/outline";
import { Icon } from "@tremor/react";
import { useState } from "react";

type Props = {
    columns: TableColumn[];
    handleSorting: TableHandleSorting | undefined;
};

export default function TableHead({ columns, handleSorting }: Props) {
    const [sortField, setSortField] = useState<TableAccessor>(null);
    const [order, setOrder] = useState<TableOrder>("asc");

    const handleSortingChange = (accessor: string) => {
        const sortOrder = accessor === sortField && order === "asc" ? "desc" : "asc";
        setSortField(accessor);
        setOrder(sortOrder);
        handleSorting?.(accessor, sortOrder);
    };

    return (
        <thead>
            <tr>
                {columns.map((column) => (
                    <th
                        key={column.accessor}
                        className={cn(
                            "group sticky top-0 z-10 select-none border-y bg-background-secondary px-4 py-2 text-start",
                            column.sortable && "cursor-pointer transition-colors duration-200 hover:bg-neutral-200"
                        )}
                        onClick={
                            column.sortable && handleSorting ? () => handleSortingChange(column.accessor) : undefined
                        }
                    >
                        <div className="flex items-center gap-2 group-last:justify-end">
                            {column.label}
                            {handleSorting && (
                                <SortIcon
                                    {...{ sortable: column.sortable, sortField, accessor: column.accessor, order }}
                                />
                            )}
                        </div>
                    </th>
                ))}
            </tr>
        </thead>
    );
}

type SortIconProps = {
    sortable: boolean;
    sortField: TableAccessor;
    accessor: string;
    order: TableOrder;
};

const SortIcon = ({ sortable, sortField, accessor, order }: SortIconProps) => {
    if (sortable) {
        if (sortField === accessor && order === "asc") {
            return <Icon className="text-inherit" size="xs" icon={ChevronUpIcon} />;
        }
        if (sortField === accessor && order === "desc") {
            return <Icon className="text-inherit" size="xs" icon={ChevronDownIcon} />;
        }

        return <span className="flex size-6 items-center p-1.5 text-center">-</span>;
    }
    return null;
};
