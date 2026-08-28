export interface FilterTime {
    gte: number;
    lte: number;
}

export interface Paging extends FilterTime {
    page: number;
}

export interface VictimsByCountryDto extends FilterTime {
    countries: string[];
}

export interface SearchDto extends Paging {
    q: string;
    c: string | string[];
}
