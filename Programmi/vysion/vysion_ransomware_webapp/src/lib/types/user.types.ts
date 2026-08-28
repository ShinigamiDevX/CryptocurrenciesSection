import { type Alert, type KeywordSubscription, type User } from "@prisma/client";

export enum AlertFrequency {
    REALTIME = "realtime",
    DAILY = "daily",
    WEEKLY = "weekly",
    MONTHLY = "monthly",
}

export type UserSettings = {
    emailAlerts: boolean;
    alertFrequency: AlertFrequency;
};

export type UserInfo = (User | null) & { keywordSubscriptions: KeywordSubscription[] } & { alerts: Alert[] };
