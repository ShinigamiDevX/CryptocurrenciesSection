import { signal } from "@preact/signals-react";
import { type UserInfo } from "../types/user.types";

export const userSignal = signal<UserInfo | null>(null);

export interface LoginStatus {
    status: "firstFactor" | "secondFactor" | "2faSetup" | "ldap";
    email?: string;
    password?: string;
    keyUri?: string;
}
export const loginStatusSignal = signal<LoginStatus>({ status: "firstFactor" });
