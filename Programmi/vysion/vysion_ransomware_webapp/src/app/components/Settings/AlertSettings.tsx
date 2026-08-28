"use client";

import { userSignal } from "$lib/client/signals";
import { updateUserSettingsAction } from "$lib/server/users/commands/updateUserSettings";
import { AlertFrequency, type UserSettings } from "$lib/types/user.types";
import { useSignals } from "@preact/signals-react/runtime";
import { Select, SelectItem, Subtitle, Switch, Title } from "@tremor/react";
import { useTransition } from "react";
import { toast } from "react-hot-toast";

export default function AlertSettings() {
    useSignals();

    const [loading, startTransition] = useTransition();
    const user = userSignal.value;

    const settings = user?.settings as UserSettings;

    async function updateNotificationFrequency(newFrequency: AlertFrequency) {
        startTransition(async () => {
            if (!settings) return;
            if (!user) return;
            const updatedSettings = { ...settings, alertFrequency: newFrequency };
            const res = await updateUserSettingsAction(user.id, updatedSettings);
            if (!res.success) {
                console.error(res.errorMessage);
                return;
            }
            toast("Notification frequency updated");
            userSignal.value = { ...user, settings: res.data };
        });
    }

    async function toggleEmailAlerts() {
        startTransition(async () => {
            if (!settings) return;
            if (!user) return;
            const updatedSettings = { ...settings, emailAlerts: !settings?.emailAlerts };
            const res = await updateUserSettingsAction(user.id, updatedSettings);
            if (!res.success) {
                console.error(res.errorMessage);
                return;
            }
            toast("Email alerts updated");
            userSignal.value = { ...user, settings: res.data };
        });
    }

    return (
        <div className="flex max-w-[200px] flex-col gap-8">
            <Title>Alert Settings</Title>
            <div className="flex flex-col gap-4">
                <Subtitle className="text-text-secondary">Notification Frequency</Subtitle>
                <Select
                    disabled={loading}
                    placeholder="Loading..."
                    value={settings?.alertFrequency}
                    onValueChange={(value) => updateNotificationFrequency(value as AlertFrequency)}
                >
                    <SelectItem value={AlertFrequency.REALTIME}>Real-time</SelectItem>
                    <SelectItem value={AlertFrequency.DAILY}>Daily</SelectItem>
                    <SelectItem value={AlertFrequency.WEEKLY}>Weekly</SelectItem>
                    <SelectItem value={AlertFrequency.MONTHLY}>Monthly</SelectItem>
                </Select>
            </div>
            <div className="flex flex-col gap-4">
                <Subtitle className="text-text-secondary">Notifications</Subtitle>
                <div className="flex justify-between gap-2 pr-1">
                    <span className="w-20 pl-2 text-sm">Email</span>
                    <Switch checked={settings?.emailAlerts ?? false} onChange={toggleEmailAlerts} disabled={loading} />
                </div>
            </div>
        </div>
    );
}
