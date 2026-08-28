import { AlertType } from "@prisma/client";
import { getVictimsByCountryAction } from "../server/ransomware/queries/getVictimsByCountry";
import { searchVictimsAction } from "../server/search/queries/searchVictims";
import type { ActionResponse } from "../types/action.types";
import type { ApiData, VictimReport } from "../types/api.types";
import { getCountryName } from "./country.utils";
/**
 * Searches for a keyword in the correct API endpoint and returns the number of hits
 * @param keyword - The keyword to search for
 * @param type - The type of alert to search for
 * @returns The number of hits for the keyword, or an error if the search failed
 **/

export async function searchForKeyword(
    keyword: string,
    type: AlertType
): Promise<ActionResponse<ApiData<VictimReport>>> {
    let data: ActionResponse<ApiData<VictimReport>>;
    switch (type) {
        case AlertType.darknet: {
            const res = await searchVictimsAction({ q: `"${keyword}"` });
            if (!res.success)
                return {
                    success: false,
                    errorCode: res.errorCode,
                    errorMessage: res.errorMessage,
                };
            data = res;
            break;
        }
        case AlertType.group: {
            const res = await searchVictimsAction({}, keyword);
            if (!res.success)
                return {
                    success: false,
                    errorCode: res.errorCode,
                    errorMessage: res.errorMessage,
                };
            data = res;
            break;
        }
        case AlertType.country: {
            const res = await getVictimsByCountryAction({ countries: [keyword] });
            if (!res.success)
                return {
                    success: false,
                    errorCode: res.errorCode,
                    errorMessage: res.errorMessage,
                };
            data = res;
            break;
        }
    }
    return data;
}

/**
 * Formats a keyword for display in the UI
 * @param keyword - The keyword to format
 * @param type - The type of alert
 * @returns The formatted keyword
 */
export function formatKeyword(keyword: string, type: AlertType): string {
    return type === AlertType.country ? getCountryName(keyword) : keyword;
}
