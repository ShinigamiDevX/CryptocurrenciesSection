import AdminDashboard from "$components/Admin/AdminDashboard";
import { UsersRepository } from "$lib/server/users/database/users.repository";

export const metadata = {
    title: "Admin",
};

export default async function AdminPage() {
    const users = (await UsersRepository.getUsers()).reverse();
    return <AdminDashboard users={users} />;
}
