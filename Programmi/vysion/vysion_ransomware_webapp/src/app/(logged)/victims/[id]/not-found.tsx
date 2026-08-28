import { type Metadata } from "next";

type Props = {
    params: {
        id: string;
    };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    return {
        title: `${params.id} - 404 Not Found`,
        description: `There is no victim report with ID: ${params.id}.`,
    };
}

function NotFound() {
    return (
        <div className="flex w-full flex-1 flex-col items-center justify-center text-center font-sans">
            <div>
                <h1 className="vertical mr-[20px] inline-block border-0 border-r border-solid border-black/30 pr-[23px] align-top text-2xl font-medium leading-[49px]">
                    404
                </h1>
                <div className="inline-block">
                    <h2 className="m-0 text-sm font-normal leading-[49px]">Victim report not found.</h2>
                </div>
            </div>
        </div>
    );
}

export default NotFound;
