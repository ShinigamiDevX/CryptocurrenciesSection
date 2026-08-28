import { z } from "zod";
import {
    type Address,
    type ApiData,
    type ApiResponse,
    type GroupData,
    HttpProtocol,
    type Stat,
    type Tag,
    type Url,
    type VictimReport,
    type VictimSource,
} from "../types/api.types";
import { AlertFrequency } from "../types/user.types";

export const createApiDataSchema = <SchemaType extends z.ZodTypeAny>(
    schema: SchemaType
): z.ZodSchema<ApiData<z.infer<SchemaType>>> => {
    return z.object({
        hits: z.array(schema),
        total: z.number(),
    });
};

export const createApiResponseSchema = <SchemaType extends z.ZodTypeAny>(
    schema: SchemaType
): z.ZodSchema<ApiResponse<z.infer<SchemaType>>> => {
    return z.object({
        data: createApiDataSchema<SchemaType>(schema),
    });
};

export const UrlSchema: z.ZodSchema<Url> = z.object({
    url: z.string(),
    urlSignature: z.string(),
    networkProtocol: z.enum([HttpProtocol.HTTP, HttpProtocol.HTTPS]).nullable(),
    domainName: z.string().nullable(),
    port: z.number().nullable(),
    path: z.string().nullable(),
    network: z.string().nullable(),
});

export const TagSchema: z.ZodSchema<Tag> = z.object({
    namespace: z.string(),
    predicate: z.string(),
    value: z.string(),
});

export const AddressSchema: z.ZodSchema<Address> = z.object({
    value: z.string(),
});

export const VictimReportSchema: z.ZodSchema<VictimReport> = z.object({
    id: z.string(),
    url: UrlSchema,
    pageTitle: z.string().nullable(),
    ransomwareGroup: z.string(),
    ransomwarePost: z.string().nullable(),
    companyName: z.string().nullable(),
    companyLink: z.string().nullable(),
    victimAddress: z.string().nullable(),
    country: z.string().nullable(),
    language: z.string().nullable(),
    html: z.string().nullable(),
    sha1sum: z.string().nullable(),
    sha256sum: z.string().nullable(),
    detectionDate: z.coerce.date(),
    ingestionDate: z.coerce.date(),
    chunk: z.boolean(),
});

export const VictimSourceSchema: z.ZodSchema<VictimSource> = z.object({
    html: z.string(),
});

export const StatSchema: z.ZodSchema<Stat> = z.object({
    key: z.string().or(z.number()),
    doc_count: z.number(),
});

export const GroupDataSchema: z.ZodSchema<GroupData> = z.object({
    key: z.string().or(z.number()),
    key_as_string: z.string(),
    doc_count: z.number(),
    group_by_type: z
        .object({
            buckets: z.array(StatSchema),
        })
        .or(z.undefined()),
});

export const EmailsFrequencySchema: z.ZodSchema<AlertFrequency> = z.enum([
    AlertFrequency.REALTIME,
    AlertFrequency.DAILY,
    AlertFrequency.WEEKLY,
    AlertFrequency.MONTHLY,
]);
