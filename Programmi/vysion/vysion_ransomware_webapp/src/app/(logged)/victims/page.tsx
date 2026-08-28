import VictimsCardContainer from "$components/Victims/VictimsCardContainer";
import { type Metadata } from "next";

export const metadata: Metadata = {
    title: "Victims",
};

export default function Victims() {
    return <VictimsCardContainer route={"victims"} />;
}
