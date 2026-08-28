import Loading from "$components/Utils/Loading";
import { Card } from "@tremor/react";

export default function LoadingGroup() {
    return (
        <main className="flex flex-col gap-4">
            <div className="flex gap-4">
                {Array.from({ length: 3 }, (_, index) => index).map((index) => (
                    <Card key={index} className="h-[100px] flex-grow">
                        <Loading />
                    </Card>
                ))}
            </div>
            <Card className="h-[420px] w-full">
                <Loading />
            </Card>
            <Card className="h-[885px] w-full">
                <Loading />
            </Card>
        </main>
    );
}
