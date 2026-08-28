import ErrorMessage from "$components/Utils/ErrorMessage";
import { getOneVictimAction } from "$lib/server/ransomware/queries/getOneVictim";
import VictimData from "$src/app/components/Victims/VictimData";
import { getMediaVictim } from "$src/lib/server/ransomware/queries/getMediaVictim";
import { getUmf } from "$src/lib/server/ransomware/queries/getUmf";
import { type Metadata } from "next";
import { notFound } from "next/navigation";

type Props = {
    params: { id: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const res = await getOneVictimAction(params.id);
    if (!res.success) {
        notFound();
    }
    return {
        title: `${res.data.pageTitle ?? res.data.companyName} - Incident Snapshot`,
    };
}

export default async function Victim({ params }: Props) {
    const res = await getOneVictimAction(params.id);
    if (!res.success) {
        return <ErrorMessage>{res.errorMessage}</ErrorMessage>;
    }
    const umfRes = await getUmf(params.id);
    if (!umfRes.success) {
        return <ErrorMessage>{umfRes.errorMessage}</ErrorMessage>;
    }
    const mediaRes = await getMediaVictim(res.data.ransomwareGroup!, res.data.id);

    return <VictimData victim={res.data} umfData={umfRes.data} media={!mediaRes.success ? undefined : mediaRes.data} />;
}
