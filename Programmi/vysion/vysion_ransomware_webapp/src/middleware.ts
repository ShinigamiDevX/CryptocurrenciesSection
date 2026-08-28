import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

const defaultRoleRoutes = [
    { role: "user", path: "/dashboard" },
    { role: "admin", path: "/dashboard" },
];

const roleRoutes = [
    { path: "/dashboard", roles: ["user", "admin"] },
    { path: "/groups", roles: ["user", "admin"] },
    { path: "/victims", roles: ["user", "admin"] },
    { path: "/licenses", roles: ["user", "admin"] },
    { path: "/alerts", roles: ["user", "admin"] },
    { path: "/settings", roles: ["user", "admin"] },
    { path: "/admin", roles: ["admin"] },
];

export default withAuth(function middleware(req): NextResponse {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;
    // If there's no token, and we are not in the login page, redirect to the login page
    if (!token) {
        return NextResponse.redirect(new URL("/login", req.url));
    }
    // If there's a token and the user is trying to access the home page, redirect to the default route for the user's role
    if (token && (pathname == "/" || pathname == "/login")) {
        const defaultRoute = defaultRoleRoutes.find((route) => route.role == token.role);
        if (defaultRoute) {
            return NextResponse.redirect(new URL(defaultRoute.path, req.url));
        }
    }
    // If there's a token and the user is trying to access a route that requires a role, check if the user has the required role
    if (token) {
        const routeRol = roleRoutes.find((route) => pathname.startsWith(route.path));
        if (routeRol?.roles.includes(token.role as string)) {
            return NextResponse.next();
        }
        const defaultRoute = defaultRoleRoutes.find((routeDefault) => routeDefault.role == token.role);
        if (defaultRoute) {
            return NextResponse.redirect(new URL(defaultRoute.path, req.url));
        }
    }
    return NextResponse.redirect(new URL("/login", req.url));
});

export const config = {
    matcher: [
        // Match all request paths except for the ones starting with:
        "/((?!img|_next/|favicon.ico|404|api|login|forgot-password|portal-sso).*)",
    ],
};
