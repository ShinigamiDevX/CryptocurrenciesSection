import { db } from "$lib/server/db";
import { type UserInfo } from "$lib/types/user.types";
import { type AlertType, type User } from "@prisma/client";
import { type PrismaClientKnownRequestError } from "@prisma/client/runtime/library";

export class UsersRepository {
    // Read operations
    static async getUsers(): Promise<User[]> {
        const users = await db.user.findMany();
        return users;
    }

    static async getUserById(userId: number): Promise<User | null> {
        const user = await db.user.findUnique({
            where: {
                id: userId,
            },
        });
        return user;
    }

    static async getUserByEmail(email: string): Promise<User | null> {
        const user = await db.user.findUnique({
            where: {
                email,
            },
        });
        return user;
    }

    static async getUserByName(name: string): Promise<User | null> {
        const user = await db.user.findUnique({
            where: {
                name,
            },
        });
        return user;
    }

    static async getUsersSubscribedToKeyword(data: { keyword: string; type: AlertType }): Promise<User[]> {
        const { keyword, type } = data;
        const users = await db.user.findMany({
            where: {
                keywordSubscriptions: {
                    some: {
                        enabled: true,
                        keyword,
                        type,
                    },
                },
            },
        });
        return users;
    }

    static async getUserInfoById(userId: number): Promise<UserInfo | null> {
        const user = await db.user.findUnique({
            where: {
                id: userId,
            },
            include: {
                keywordSubscriptions: true,
                alerts: true,
            },
        });
        return user;
    }

    // Write operations
    static async createUser(user: Partial<User>): Promise<User | PrismaClientKnownRequestError> {
        try {
            const defaultSettings = { emailAlerts: true, alertFrequency: "realtime" };
            const newUser = await db.user.create({
                data: {
                    ...user,
                    settings: defaultSettings,
                },
            });
            return newUser;
        } catch (e) {
            console.error("[UsersRepository - create user]", e);
            return e as PrismaClientKnownRequestError;
        }
    }

    static async updateUser(userId: number, update: Partial<User>): Promise<User | null> {
        try {
            const updatedUser = await db.user.update({
                where: {
                    id: userId,
                },
                data: {
                    ...update,
                    settings: update.settings ?? undefined,
                },
            });
            return updatedUser;
        } catch (e) {
            console.error(e);
            return null;
        }
    }

    static async deleteUser(userId: number): Promise<User | null> {
        try {
            const deletedUser = await db.user.delete({
                where: {
                    id: userId,
                },
            });
            return deletedUser;
        } catch (e) {
            console.error(e);
            return null;
        }
    }
}
