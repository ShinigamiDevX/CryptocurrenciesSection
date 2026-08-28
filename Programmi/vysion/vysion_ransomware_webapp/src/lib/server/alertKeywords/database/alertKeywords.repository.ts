import { db } from "$lib/server/db";
import { type AlertKeyword, type AlertType } from "@prisma/client";

export class AlertKeywordsRepository {
    // Read operations
    static async getAlertKeywords(): Promise<AlertKeyword[]> {
        const alertKeywords = await db.alertKeyword.findMany();
        return alertKeywords;
    }

    static async getAlertKeyword(keywordData: { keyword: string; type: AlertType }): Promise<AlertKeyword | null> {
        const alertKeyword = await db.alertKeyword.findUnique({
            where: {
                keyword_type: {
                    ...keywordData,
                },
            },
        });
        return alertKeyword;
    }

    // Write operations
    static async createAlertKeyword(keywordData: {
        keyword: string;
        type: AlertType;
    }): Promise<AlertKeyword | null> {
        try {
            const newAlertKeyword = await db.alertKeyword.create({
                data: {
                    ...keywordData,
                },
            });
            return newAlertKeyword;
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    static async updateAlertKeyword(keywordData: {
        keyword: string;
        type: AlertType;
        updatedAt: Date;
    }): Promise<AlertKeyword | null> {
        try {
            const { keyword, type, updatedAt } = keywordData;
            const updatedAlertKeyword = await db.alertKeyword.update({
                where: {
                    keyword_type: {
                        keyword,
                        type,
                    },
                },
                data: { updatedAt },
            });
            return updatedAlertKeyword;
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    static async deleteAlertKeyword(keywordData: {
        keyword: string;
        type: AlertType;
    }): Promise<boolean> {
        try {
            const deletedAlertKeyword = await db.alertKeyword.delete({
                where: {
                    keyword_type: {
                        ...keywordData,
                    },
                },
            });
            return !!deletedAlertKeyword;
        } catch (e) {
            console.error(e);
            return false;
        }
    }
}
