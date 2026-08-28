import { db } from "$lib/server/db";
import { type AlertType, type KeywordSubscription } from "@prisma/client";

export class KeywordSubscriptionsRepository {
    // Read operations
    static async getKeywordSubscriptions(): Promise<KeywordSubscription[]> {
        const keywordSubscriptions = await db.keywordSubscription.findMany();
        return keywordSubscriptions;
    }

    static async getKeywordSubscriptionById(id: string): Promise<KeywordSubscription | null> {
        const keywordSubscription = await db.keywordSubscription.findUnique({
            where: {
                id,
            },
        });
        return keywordSubscription;
    }

    static async getKeywordSubscriptionsByUserId(userId: number): Promise<KeywordSubscription[]> {
        const keywordSubscriptions = await db.keywordSubscription.findMany({
            where: {
                userId,
            },
        });
        return keywordSubscriptions;
    }

    // Write operations
    static async createKeywordSubscription(
        userId: number,
        keyword: string,
        type: AlertType
    ): Promise<KeywordSubscription | null> {
        try {
            const newKeywordSubscription = await db.keywordSubscription.create({
                data: {
                    userId,
                    keyword,
                    type,
                },
            });
            return newKeywordSubscription;
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    static async updateKeywordSubscription(
        id: string,
        keywordSubscription: Partial<KeywordSubscription>
    ): Promise<KeywordSubscription | null> {
        try {
            const updatedKeywordSubscription = await db.keywordSubscription.update({
                where: {
                    id,
                },
                data: {
                    ...keywordSubscription,
                },
            });
            return updatedKeywordSubscription;
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    static async deleteKeywordSubscription(id: string): Promise<boolean> {
        try {
            await db.keywordSubscription.delete({
                where: {
                    id,
                },
            });
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }
}
