import { createApiResponseSchema, VictimReportSchema } from "$lib/schemas/api.schemas";
import { type ActionResponse, ActionErrors, ActionErrorsMap } from "$lib/types/action.types";
import { type ApiData, type VictimReport } from "$lib/types/api.types";
import { type VictimsByCountryDto } from "$lib/types/dto.types";
import { env } from "$src/env.mjs";

export async function getVictimsByCountryAction(
    query: Partial<VictimsByCountryDto>
): Promise<ActionResponse<ApiData<VictimReport>>> {
    try {
        const url = new URL(`${env.VYSION_API_URL}/api/v1/ransomware/country-filter`);
        query.countries ? url.searchParams.append("countries", query.countries.toString()) : null;
        query.gte ? url.searchParams.append("gte", `${query.gte}`) : null;
        query.lte ? url.searchParams.append("lte", `${query.lte}`) : null;

        const res = await fetch(url, {
            method: "GET",
            headers: {
                "x-api-key": env.VYSION_API_KEY,
                Accept: "application/json",
            },
            cache: "no-cache",
        });
        if (!res.ok) {
            const status = ActionErrorsMap[res.status];
            return {
                success: false,
                errorCode: status ?? res.status,
                errorMessage: `There was an error fetching the victims by country ${res.status}`,
            };
        }
        const schema = createApiResponseSchema(VictimReportSchema); // Create the response schema

        const apiResponse = schema.parse(await res.json()); // Validate the response data
        return { success: true, data: apiResponse.data };
    } catch (error) {
        console.error("There was an error retrieving the victims by country", JSON.stringify(error));
        return {
            success: false,
            errorCode: ActionErrors.INTERNAL_SERVER_ERROR,
            errorMessage: "There was an error retrieving the victims by country",
        };
    }
}
