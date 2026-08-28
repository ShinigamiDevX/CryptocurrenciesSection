import Loading from "$components/Utils/Loading";
import { Card } from "@tremor/react";

export default function LoadingAdmin() {
    return (
        <Card className="h-full">
            <Loading />
        </Card>
    );
}
