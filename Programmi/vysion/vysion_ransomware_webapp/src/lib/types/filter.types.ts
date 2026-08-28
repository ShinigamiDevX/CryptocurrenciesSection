export enum FilterDate {
    Any = "0",
    LastWeek = "7",
    LastMonth = "30",
    LastYear = "365",
    LastThreeYears = "1095",
    LastFiveYears = "1825",
}

export enum FilterLanguage {
    Any = "",
    Arabic = "ar",
    English = "en",
    French = "fr",
    German = "de",
    Japanese = "ja",
    Russian = "ru",
    Spanish = "es",
}

export enum FilterNetwork {
    Any = "",
    Tor = "tor",
    I2p = "i2p",
    Clearnet = "clearnet",
}

export enum FilterSearchType {
    Darknet = "darknet",
    Groups = "groups",
}

export interface SearchDto {
    query: string;
    language: FilterLanguage;
    network: FilterNetwork;
    searchType: FilterSearchType;
    gte: number;
    lte: number;
    page: number;
}
