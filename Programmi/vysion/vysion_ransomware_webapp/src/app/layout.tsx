import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Toaster } from "react-hot-toast";
import AuthProvider from "./components/AuthProvider";
import "./styles/globals.css";

export const metadata: Metadata = {
	title: {
		template: "%s | Vysion Ransomware",
		default: "Vysion Ransomware - Dark web intelligence",
	},
	description:
		"Vysion Ransomware is a dark web intelligence platform that provides real-time ransomware intelligence and monitoring services.",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<body>
				<Toaster
					position="top-center"
					reverseOrder={false}
					gutter={8}
					toastOptions={{
						duration: 3000,
						style: {
							border: "1px solid #0000001a",
						},
						success: {
							style: {
								color: "#fff",
								backgroundColor: "#22c55e",
								border: "1px solid #10b981",
							},
						},
						error: {
							style: {
								color: "#fff",
								backgroundColor: "#bb0202",
								border: "1px solid #ef4444",
							},
						},
					}}
				/>
				<AuthProvider>{children}</AuthProvider>
			</body>
		</html>
	);
}
