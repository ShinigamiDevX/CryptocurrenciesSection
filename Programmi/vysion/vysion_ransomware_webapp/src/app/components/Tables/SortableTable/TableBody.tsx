import { type TableColumn, type TableData } from "$lib/types/table.types";

type Props<T = string | number> = {
    columns: TableColumn[];
    tableData: TableData<T>[];
};

export default function TableBody<T = string | number>({ tableData, columns }: Props<T>) {
    return (
        <tbody>
            {tableData.map((data) => (
                <tr key={data.id as string}>
                    {columns.map((column) => (
                        <td key={column.accessor} className="border-b px-4 last:text-end">
                            {(data[column.accessor] as string | null | undefined) ?? "--"}
                        </td>
                    ))}
                </tr>
            ))}
        </tbody>
    );
}
