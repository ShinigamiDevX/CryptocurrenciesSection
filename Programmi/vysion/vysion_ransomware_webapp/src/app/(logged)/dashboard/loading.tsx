import Loading from "$components/Utils/Loading";
import { Card } from "@tremor/react";

export default function LoadingDashboard() {
    return (
        <main className="flex w-full flex-1 flex-col gap-4">
            <div className="flex">
                <Card className="h-[70px] flex-grow sm:h-[100px]">
                    <Loading />
                </Card>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
                {Array.from({ length: 4 }, (_, index) => index).map((index) => (
                    <Card key={index} className="h-[100px] flex-grow">
                        <Loading />
                    </Card>
                ))}
            </div>
            <div className="grid grid-rows-4 gap-4 sm:grid-cols-3 sm:grid-rows-2">
                <div className="sm:col-span-2">
                    <Card className="h-[500px]">
                        <Loading />
                    </Card>
                </div>
                <div className="sm:col-span-1">
                    <Card className="h-[500px]">
                        <Loading />
                    </Card>
                </div>
                <div className="sm:col-span-2">
                    <Card className="h-[500px]">
                        <Loading />
                    </Card>
                </div>
                <div className="sm:col-span-1">
                    <Card className="h-[500px]">
                        <Loading />
                    </Card>
                </div>
            </div>
        </main>
    );
}
