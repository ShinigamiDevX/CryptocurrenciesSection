import TableCard from "$components/Cards/TableCard";
import Loading from "$components/Utils/Loading";

export default function LoadingVictims() {
    return (
        <TableCard title={"Victims"}>
            <Loading />
        </TableCard>
    );
}
