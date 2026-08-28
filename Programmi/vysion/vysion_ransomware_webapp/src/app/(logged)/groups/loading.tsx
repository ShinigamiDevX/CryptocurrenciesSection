import Loading from "$components/Utils/Loading";
import { Card } from "@tremor/react";

export default function LoadingGroups() {
    return (
        <Card className="h-[var(--size-container)]">
            <Loading />
        </Card>
    );
}
