import Loading from "$components/Utils/Loading";
import { Card, Divider } from "@tremor/react";

export default function LoadingVictim() {
    return (
        <Card>
            <div className="flex flex-col gap-4">
                <div className="flex justify-end">
                    <div className="h-[40px] w-[250px]">
                        <Loading />
                    </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-4">
                        {Array.from({ length: 5 }, (_, index) => index).map((index) => (
                            <div className="flex gap-4" key={index}>
                                <div className="h-[18px] min-w-24">
                                    <Loading />
                                </div>
                                <div className="h-[18px] w-full">
                                    <Loading />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col gap-4">
                        {Array.from({ length: 5 }, (_, index) => index).map((index) => (
                            <div className="flex gap-4" key={index}>
                                <div className="h-[18px] min-w-24">
                                    <Loading />
                                </div>
                                <div className="h-[18px] w-full">
                                    <Loading />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <Divider />

            <div className="flex flex-col gap-4">
                <div className="flex h-[340px] w-full flex-col gap-4">
                    <Loading />
                </div>
            </div>
        </Card>
    );
}
