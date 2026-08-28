import { Card } from "@tremor/react";

type Props = {
    subtitle: string;
    title: string;
};
export default function TitleCard({ subtitle, title }: Props) {
    return (
        <Card className="flex w-full max-w-32 flex-1 flex-grow flex-col gap-2 break-words rounded bg-sidebar p-4 pr-4 sm:max-w-full">
            <h5 className="block max-w-fit truncate text-xs font-bold uppercase text-background">{subtitle}</h5>
            <span className="block truncate text-xl font-semibold text-background">{title}</span>
        </Card>
    );
}
