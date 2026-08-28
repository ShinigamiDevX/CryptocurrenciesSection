"use client";

import { userSignal } from "$lib/client/signals";
import { addKeywordSubscriptionAction } from "$lib/server/keywordSubscriptions/commands/addKeywordSubscription";
import { getGroupStatsAction } from "$lib/server/ransomware/queries/getGroupStats";
import { type SelectOption } from "$lib/types/form.types";
import { getCountryAsOptions } from "$lib/utils/country.utils";
import { PlusIcon } from "@heroicons/react/outline";
import { useSignals } from "@preact/signals-react/runtime";
import { AlertType } from "@prisma/client";
import { Icon, SearchSelect, SearchSelectItem, Select, SelectItem, TextInput, Title } from "@tremor/react";
import { type FormEvent, useEffect, useState, useTransition } from "react";
import { toast } from "react-hot-toast";

export default function AddKeywordForm() {
    useSignals();
    const user = userSignal.value;

    const [newKeyword, setNewKeyword] = useState("");
    const [keywordType, setKeywordType] = useState("");
    const [loading, startTransition] = useTransition();
    const [groupOptions, setGroupOptions] = useState<SelectOption[]>([]);
    const countryOptions: SelectOption[] = getCountryAsOptions();


    function resetKeyword() {
        setNewKeyword("");
        setKeywordType("");
    }

    useEffect(() => {
        if (keywordType !== AlertType.group) {
            return;
        }
        async function getGroups() {
            const res = await getGroupStatsAction();
            if (!res.success) {
                console.error(res.errorMessage);
                toast.error(res.errorMessage);
                return;
            }
            setGroupOptions(res.data.hits.map((group) => ({ value: `${group.key}`, label: `${group.key}` })));
        }
        getGroups().catch((e) => console.error(e));
    }, [keywordType]);

    async function addKeyword(e: FormEvent) {
        startTransition(async () => {
            e.preventDefault();
            if (!user) return;
            if (user.keywordSubscriptions.find((sub) => sub.keyword === newKeyword)) {
                toast.error("You are already subscribed to this keyword");
                resetKeyword();
                return;
            }
            const res = await addKeywordSubscriptionAction(user.id, newKeyword, keywordType as AlertType);
            if (!res.success) {
                console.error(res.errorMessage);
                toast.error(res.errorMessage);
                return;
            }
            const newSubscription = res.data;
            userSignal.value = {
                ...user,
                keywordSubscriptions: [...user.keywordSubscriptions, newSubscription],
            };
            resetKeyword();
        });
    }

    return (
        <div className="flex flex-col gap-4 px-4 py-4">
            <Title>Add Keyword</Title>
            <form className="flex items-center gap-2" onSubmit={addKeyword}>
                <Select
                    disabled={loading}
                    value={keywordType}
                    placeholder="Keyword Type"
                    className="w-32"
                    onValueChange={(val) => setKeywordType(val)}
                >
                    <SelectItem value={AlertType.darknet}>Search Term</SelectItem>
                    <SelectItem value={AlertType.group}>Threat Group</SelectItem>
                    <SelectItem value={AlertType.country}>Country</SelectItem>
                </Select>
                <div className="w-56">
                    {keywordType === AlertType.darknet ? (
                        <TextInput
                            placeholder="Type your Keyword..."
                            disabled={loading}
                            type="text"
                            value={newKeyword}
                            onChange={(e) => setNewKeyword(e.target.value)}
                        />
                    ) : keywordType === AlertType.group ? (
                        <Select
                            disabled={loading}
                            placeholder="Select Threat Group"
                            onValueChange={(val) => setNewKeyword(val)}
                        >
                            {groupOptions.length ? (
                                groupOptions.map((option, index) => (
                                    <SelectItem key={index} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))
                            ) : (
                                <SelectItem value="loading">Loading...</SelectItem>
                            )}
                        </Select>
                    ) : keywordType === AlertType.country ? (
                        <SearchSelect
                            disabled={loading}
                            placeholder="Select Country"
                            onValueChange={(val) => setNewKeyword(val)}
                        >
                            {countryOptions.map((option, index) => (
                                <SearchSelectItem key={index} value={option.value}>
                                    {option.label}
                                </SearchSelectItem>
                            ))}
                        </SearchSelect>
                    ) : (
                        <TextInput disabled={true} placeholder="Select Keyword Type" />
                    )}
                </div>
                <button
                    disabled={!newKeyword || !keywordType || loading}
                    title="Add keyword"
                    type="submit"
                    className="rounded-full bg-green-400 hover:bg-green-500 disabled:bg-green-200"
                >
                    <Icon size="xs" icon={PlusIcon} className="text-white" />
                </button>
            </form>
        </div>
    );
}
