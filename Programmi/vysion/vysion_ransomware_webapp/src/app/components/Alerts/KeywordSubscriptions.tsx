import { Divider } from "@tremor/react";
import KeywordsTable from "../Tables/KeywordsTable";
import AddKeywordForm from "./AddKeywordForm";

export default function KeywordSubscriptions() {
    return (
        <main className="flex h-full flex-col">
            <div className="w-full overflow-x-auto md:flex-[1_1_0]">
                <KeywordsTable />
            </div>
            <Divider className="m-0" />
            <AddKeywordForm />
        </main>
    );
}
