import { VictimSourceSchema, createApiResponseSchema } from "$lib/schemas/api.schemas";
import { ActionErrors, type ActionResponse } from "$lib/types/action.types";
import { type VictimSource } from "$lib/types/api.types";
import { env } from "$src/env.mjs";

export async function getVictimSource(id: string): Promise<ActionResponse<VictimSource>> {
    const url = `${env.VYSION_API_URL}/api/v1/source/${id}`;
    try {
        const res = await fetch(url, {
            method: "GET",
            headers: {
                "x-api-key": env.VYSION_API_KEY,
                Accept: "application/json",
            },
            cache: "no-cache",
        });

        const schema = createApiResponseSchema(VictimSourceSchema);
        const apiResponse = schema.parse(await res.json());
        const hit = apiResponse.data.hits[0];
        if (!hit) {
            return {
                success: false,
                errorCode: ActionErrors.NOT_FOUND,
                errorMessage: "Victim source not found",
            };
        }
        return {
            success: true,
            data: hit,
        };
    } catch (error) {
        console.error("Error while fetching victim source: ", JSON.stringify(error));
        return {
            success: false,
            errorCode: ActionErrors.INTERNAL_SERVER_ERROR,
            errorMessage: "Error retrieving victim source",
        };
    }
}
