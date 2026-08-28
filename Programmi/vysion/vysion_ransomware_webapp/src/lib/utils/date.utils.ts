import { FilterDate } from "../types/filter.types";

export function getCurrentDateFormatted() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0"); // months are zero-indexed
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function getTimestampsFromFilterDate(filterDate: FilterDate): [number, number] {
    const now = new Date().getTime();
    switch (filterDate) {
        case FilterDate.Any:
            return [0, now];
        case FilterDate.LastWeek:
            return [now - 604800000, now];
        case FilterDate.LastMonth:
            return [now - 2592000000, now];
        case FilterDate.LastYear:
            return [now - 31536000000, now];
        default:
            return [0, now];
    }
}

export function getFilterDateFromTimestamps(gte: number): FilterDate {
    const now = new Date().getTime();
    const oneWeekAgo = now - 604800000;
    const oneMonthAgo = now - 2592000000;
    const oneYearAgo = now - 31536000000;
    switch (true) {
        case gte === 0:
            return FilterDate.Any;
        case gte < oneWeekAgo && gte > oneMonthAgo:
            return FilterDate.LastWeek;
        case gte < oneMonthAgo && gte > oneYearAgo:
            return FilterDate.LastMonth;
        case gte < oneYearAgo:
            return FilterDate.LastYear;
        default:
            return FilterDate.Any;
    }
}

// returns date like Yyyy-MM-dd'T'HH:mm:ss
export function getFormattedDateFromTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    const millis = date.getMilliseconds().toString().padStart(3, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${millis}`;
}

export function getFormattedDateFrom(daysAgo = 0): string {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return `${year}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}
