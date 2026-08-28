import type { ReportInfo } from "../utils/report.utils";

export type ApiData<T> = {
    hits: T[];
    total: number;
};

export type ApiResponse<T> = {
    data: ApiData<T>;
};

export interface ApiDateQuery {
    gte?: string;
    lte?: string;
}

export interface ApiCountriesQuery {
    countries?: string[];
}

export enum HttpProtocol {
    HTTP = "http",
    HTTPS = "https",
}

export type NetworkProtocol = HttpProtocol.HTTP | HttpProtocol.HTTPS;

export type Url = {
    url: string;
    networkProtocol: NetworkProtocol | null;
    domainName: string | null;
    port: number | null;
    path: string | null;
    urlSignature: string;
    network: string | null;
};

export type Tag = {
    namespace: string;
    predicate: string;
    value: string | null;
};

export type Address = {
    value: string;
};

export type VictimReport = {
    id: string;
    url: Url;
    pageTitle: string | null;
    country: string | null;
    language: string | null;
    html: string | null;
    ransomwareGroup: string | null;
    ransomwarePost: string | null;
    sha1sum: string | null;
    sha256sum: string | null;
    detectionDate: Date;
    ingestionDate: Date;
    chunk: boolean;
    companyName: string | null;
    companyLink: string | null;
    victimAddress: string | null;
};

export type EditVictimReportDTO = {
    id: string;
    date?: string;
    group?: string;
    company?: string;
    company_link?: string;
    victim_address?: string;
    country?: string;
    page_title?: string;
    info?: string;
};

export type VictimSource = {
    html: string;
};

export type Stat = {
    key: string | number;
    doc_count: number;
};

export interface StatWithPercentage extends Stat {
    percentage: string;
}

export interface GroupData extends Stat {
    key_as_string: string;
    group_by_type?: {
        buckets: Stat[];
    };
}

export interface HistogramData {
    date: string;
    [group: string]: string | number;
}

export interface SelectOption<T = string> {
    value: T;
    label: string;
}

export interface ReportQuery {
    country?: string | string[];
    info?: ReportInfo | ReportInfo[];
    start?: string;
    end?: string;
}

export type Queries<T = unknown> = Record<string, T>;
