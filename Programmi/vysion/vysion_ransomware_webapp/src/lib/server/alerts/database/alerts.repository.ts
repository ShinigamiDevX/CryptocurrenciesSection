import { db } from "$lib/server/db";
import { type Alert, type AlertType } from "@prisma/client";

export class AlertsRepository {
    // Read operations
    static async getAlerts(): Promise<Alert[]> {
        const alerts = await db.alert.findMany();
        return alerts;
    }

    static async getAlertById(alertId: string): Promise<Alert | null> {
        const alert = await db.alert.findUnique({
            where: {
                id: alertId,
            },
        });
        return alert;
    }

    static async getLastAlert(keyword: string): Promise<Alert | null> {
        const alert = await db.alert.findFirst({
            where: {
                keyword,
            },
            orderBy: {
                createdAt: "desc",
            },
        });
        return alert;
    }

    static async getAlertsFromRange(startDate: Date, endDate: Date): Promise<Alert[]> {
        const alerts = await db.alert.findMany({
            where: {
                createdAt: {
                    gte: startDate,
                    lte: endDate,
                },
            },
        });
        return alerts;
    }

    // Write operations
    static async createAlert(alertData: {
        userId: number;
        keyword: string;
        type: AlertType;
        message: string;
        htmlMessage: string;
        newHits: number;
        timeRange: number;
    }): Promise<Alert | null> {
        try {
            const newAlert = await db.alert.create({
                data: {
                    ...alertData,
                },
            });
            return newAlert;
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    static async updateAlert(alertId: string, update: Partial<Alert>): Promise<Alert | null> {
        try {
            const updatedAlert = await db.alert.update({
                where: {
                    id: alertId,
                },
                data: update,
            });
            return updatedAlert;
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    static async markAllAlertsFromUserAsRead(userId: number): Promise<boolean> {
        try {
            const updatedAlerts = await db.alert.updateMany({
                where: {
                    userId,
                    read: false,
                },
                data: {
                    read: true,
                },
            });
            return !!updatedAlerts;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    static async deleteAllAlertsFromUser(userId: number): Promise<boolean> {
        try {
            const deletedAlerts = await db.alert.deleteMany({
                where: {
                    userId,
                },
            });
            return !!deletedAlerts;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    static async deleteAlert(alertId: string): Promise<boolean> {
        try {
            const deletedAlert = await db.alert.delete({
                where: {
                    id: alertId,
                },
            });
            return !!deletedAlert;
        } catch (e) {
            console.error(e);
            return false;
        }
    }
}
