import { type Stat } from "$lib/types/api.types";
import Link from "next/link";

export default function GroupsTable({ groupStats }: { groupStats: Stat[] }) {
    return (
        <table className="w-full text-left text-sm text-gray-500">
            <thead className="table h-[var(--size-table-thread)] w-full table-fixed border-y bg-background-secondary py-3 text-xs uppercase text-gray-700">
                <tr>
                    <th scope="col" className="px-6">
                        Name
                    </th>
                    <th scope="col" className="px-4">
                        Victim counter
                    </th>
                </tr>
            </thead>
            <tbody className="block w-full flex-col overflow-auto">
                {groupStats.map((stat) => {
                    return (
                        <Link href={`/groups/${stat.key}?q="${stat.key}"`} key={stat.key}>
                            <tr
                                className="table w-full table-fixed border-b bg-white hover:bg-background-secondary"
                                key={stat.key}
                            >
                                <td className="px-6 py-4">{stat.key}</td>
                                <td className="px-6 py-4 font-normal text-black">{stat.doc_count}</td>
                            </tr>
                        </Link>
                    );
                })}
            </tbody>
        </table>
    );
}
