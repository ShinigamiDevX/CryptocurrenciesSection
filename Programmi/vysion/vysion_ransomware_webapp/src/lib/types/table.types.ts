export type TableAccessor = string | null | undefined;
export type TableOrder = "asc" | "desc";
export type TableHandleSorting = (accessor: TableAccessor, order: TableOrder) => void;
export type TableData<T = string | number> = Record<string, T>;
export interface TableColumn {
    label: string;
    accessor: string;
    sortable: boolean;
    order?: TableOrder;
}

export type TableHookResult<T = string | number> = [TableData<T>[], TableHandleSorting];
