"use client";

import { editVictimInformationAction } from "$lib/server/victims/commands/editVictimInformation";
import { type VictimReport } from "$lib/types/api.types";
import { getCountryAsOptions } from "$lib/utils/country.utils";
import { Button, DatePicker, Dialog, DialogPanel, SearchSelect, SearchSelectItem } from "@tremor/react";
import { formatRelative } from "date-fns";
import { enGB } from "date-fns/locale";
import { useState, useTransition, type FormEvent } from "react";
import { toast } from "react-hot-toast";
import VictimSubmitInformation from "./VictimSubmitInformation";

type Props = {
    data: VictimReport;
    onCancel: () => void;
    onFinally: (data: VictimReport) => void;
};

function VictimsEditForm({ data, onCancel, onFinally }: Props) {
    const [loading, startTransition] = useTransition();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [date, setDate] = useState(data.detectionDate);
    const [selectedCountry, setSelectedCountry] = useState<string | undefined>(
        data.country?.toUpperCase() ?? undefined
    );
    const [formEvent, setFormEvent] = useState<FormEvent<HTMLFormElement> | null>(null);

    const labels: Record<string, string | undefined> = {
        Date: formatRelative(data.detectionDate, new Date(), { locale: enGB }),
        Title: data.pageTitle ?? data.companyName ?? undefined,
        Perp: data.ransomwareGroup ?? undefined,
        Company: data.companyName ?? undefined,
        Website: data.companyLink ?? undefined,
        Address: data.victimAddress ?? undefined,
        Country: data.country ?? undefined,
        Info: data.ransomwarePost ?? undefined,
    };

    const countries = getCountryAsOptions();

    async function updateInformation(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formData = new FormData(event.target as HTMLFormElement);
        const information = { date, ...Object.fromEntries(formData.entries()) } as Record<string, string | Date>;
        const localDate = date ? new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000) : undefined;
        const res = await editVictimInformationAction({
            id: data.id,
            page_title: information?.title as string,
            date: localDate?.toISOString(),
            group: information?.prep as string,
            company: information?.company as string,
            company_link: information?.website as string,
            victim_address: information?.address as string,
            country: selectedCountry,
            info: information?.info as string,
        });
        if (!res.success) {
            toast.error("Failed to update victim information");
            console.error(res.errorMessage);
        }

        if (res.success) {
            toast.success("Victim information updated successfully");
            onFinally({
                ...data,
                pageTitle: information?.title as string,
                detectionDate: information?.date as Date,
                ransomwareGroup: information?.prep as string,
                companyName: information?.company as string,
                companyLink: information?.website as string,
                victimAddress: information?.address as string,
                country: selectedCountry ?? null,
                ransomwarePost: information?.info as string,
            });
        }
    }

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setFormEvent(event);
        setIsDialogOpen(true);
    };

    const confirmSubmit = () => {
        if (formEvent) {
            startTransition(() => updateInformation(formEvent));
            setIsDialogOpen(false);
        }
    };

    return (
        <>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                <div className="flex flex-1 flex-col gap-2">
                    <div className="flex flex-col gap-2">
                        <label className="pl-1 text-tremor-content-subtle" htmlFor="date">
                            Title
                        </label>
                        <input
                            id="title"
                            name="title"
                            type="text"
                            defaultValue={labels.Title}
                            placeholder="Victim's page title"
                            className="w-full rounded border-black/10 placeholder:text-sm"
                            disabled={loading}
                        />
                    </div>
                    <div className="flex flex-col gap-2 lg:flex-row lg:gap-4">
                        <div className="flex flex-1 flex-col gap-2">
                            <label className="pl-1 text-tremor-content-subtle" htmlFor="website">
                                Company
                            </label>
                            <input
                                id="company"
                                name="company"
                                type="text"
                                defaultValue={labels.Company}
                                placeholder="Company name"
                                className="w-full rounded border-black/10 placeholder:text-sm"
                                disabled={loading}
                            />
                        </div>
                        <div className="flex flex-1 flex-col gap-2">
                            <label className="pl-1 text-tremor-content-subtle" htmlFor="website">
                                Website
                            </label>
                            <input
                                id="website"
                                name="website"
                                type="text"
                                defaultValue={labels.Website}
                                placeholder="Company Website"
                                className="w-full rounded border-black/10 placeholder:text-sm"
                                disabled={loading}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 lg:flex-row lg:gap-4">
                        <div className="flex flex-1 flex-col gap-2">
                            <label className="pl-1 text-tremor-content-subtle" htmlFor="address">
                                Address
                            </label>
                            <input
                                id="address"
                                name="address"
                                type="text"
                                defaultValue={labels.Address}
                                placeholder="Victim Address"
                                className="w-full rounded border-black/10 placeholder:text-sm"
                                disabled={loading}
                            />
                        </div>
                        <div className="flex flex-1 flex-col gap-2">
                            <label className="pl-1 text-tremor-content-subtle" htmlFor="perp">
                                Threat Group
                            </label>
                            <input
                                id="perp"
                                name="prep"
                                type="text"
                                defaultValue={labels.Perp}
                                placeholder="Ransomware Group Name"
                                className="w-full rounded border-black/10 placeholder:text-sm"
                                disabled={loading}
                            />
                        </div>
                    </div>
                    <div className="flex flex-col gap-2 lg:flex-row lg:gap-4">
                        <div className="flex flex-1 flex-col gap-2">
                            <span className="flex flex-1 items-center text-tremor-content-subtle">Country</span>
                            <SearchSelect
                                placeholder="Select country"
                                value={selectedCountry}
                                onValueChange={(value) => setSelectedCountry(value)}
                                disabled={loading}
                            >
                                {countries.map((option, index) => (
                                    <SearchSelectItem key={index} value={option.value}>
                                        {option.label}
                                    </SearchSelectItem>
                                ))}
                            </SearchSelect>
                        </div>
                        <div className="flex flex-1 flex-col gap-2">
                            <label className="pl-1 text-tremor-content-subtle" htmlFor="date">
                                Date
                            </label>
                            <DatePicker
                                defaultValue={date}
                                onValueChange={(value) => setDate(value!)}
                                disabled={loading}
                            />
                        </div>
                    </div>
                    <div className="flex flex-1 flex-col gap-2">
                        <label className="pl-1 text-tremor-content-subtle" htmlFor="country">
                            Info
                        </label>
                        <textarea
                            name="info"
                            id="info"
                            defaultValue={labels.Info}
                            placeholder="Additional Information"
                            className="textarea-grow max-h-80 min-h-40 w-full rounded border-black/10 placeholder:text-sm"
                            disabled={loading}
                        />
                    </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button
                        className="flex flex-1"
                        type="button"
                        color="red"
                        size="sm"
                        disabled={loading}
                        onClick={onCancel}
                    >
                        Cancel
                    </Button>
                    <VictimSubmitInformation className="flex flex-1" disabled={loading} />
                </div>
            </form>
            <Dialog open={isDialogOpen} onClose={() => setIsDialogOpen(false)}>
                <DialogPanel>
                    <h3 className="lg text-lg font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">
                        Confirm Submission
                    </h3>
                    <p className="mt-2 text-tremor-default leading-6 text-tremor-content dark:text-dark-tremor-content">
                        Are you sure you want to submit the information?
                    </p>
                    <footer className="mt-4 flex flex-wrap gap-2">
                        <Button className="flex-1" color="red" onClick={() => setIsDialogOpen(false)}>
                            Keep Editing
                        </Button>
                        <Button className="flex-1 lg:w-fit" variant="primary" onClick={confirmSubmit}>
                            Confirm Changes
                        </Button>
                    </footer>
                </DialogPanel>
            </Dialog>
        </>
    );
}

export default VictimsEditForm;
