import TableCard from "$components/Cards/TableCard";
import Loading from "$components/Utils/Loading";

function AlertsLoadingPage() {
    return (
        <main className="grid gap-4 sm:h-[var(--size-container)] sm:grid-cols-2 sm:grid-rows-3">
            <TableCard title={"Recent Alerts"} className="sm:row-span-3">
                <div className="flex flex-col gap-4 px-4">
                    <div className="flex h-[var(--size-table-thread)] items-center justify-center gap-2 rounded-lg sm:justify-end">
                        <div className="h-7 w-36">
                            <Loading />
                        </div>
                        <div className="h-7 w-24">
                            <Loading />
                        </div>
                    </div>
                    <LoadingAlerts />
                </div>
            </TableCard>
            <TableCard title="Keyword Subscriptions" className="sm:row-span-2">
                <LoadingResults />
            </TableCard>
        </main>
    );
}

export default AlertsLoadingPage;

function LoadingAlerts() {
    const numberRows = Array.from({ length: 6 }, (_, index) => index);
    return (
        <>
            {numberRows.map((_, index) => (
                <div key={index} className="h-[92px] w-full">
                    <Loading />
                </div>
            ))}
        </>
    );
}

function LoadingResults() {
    const numberRows = Array.from({ length: 6 }, (_, index) => index);
    const numberColumns = Array.from({ length: 5 }, (_, index) => index);
    return (
        <>
            {numberRows.map((_, index) => (
                <tr
                    key={`${index}`}
                    className="table w-full table-fixed border-b bg-white hover:bg-background-secondary"
                >
                    {numberColumns.map((_, index) => (
                        <td key={index} className="px-4 py-[1.4rem]">
                            <div className="h-[18px] w-[75px]">
                                <Loading />
                            </div>
                        </td>
                    ))}
                </tr>
            ))}
        </>
    );
}
