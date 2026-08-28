"use client";

import Image from "next/image";
import Link from "next/link";
import ByronLogo from "public/images/byronlabs/tagline_black_byronlabs.png";
import EactdaLogo from "public/images/logo_eactda_black.png";
import pjson from "../../../../package.json";

export default function Footer() {
	return (
		<footer className="h-[var(--size-footer)]">
			<div className="flex h-full w-full flex-col justify-between gap-2 rounded px-8 text-slate-700 sm:flex-row">
				<div className="flex w-full items-center justify-center gap-4 text-center text-sm font-semibold md:justify-start">
					<a
						className="flex items-center gap-4 text-sm text-sidebar"
						href="https://byronlabs.io/"
						target="_blank"
						rel="noreferrer"
					>
						© Vysion Ransomware {pjson.version} | 2024 - 2025{" "}
						Byron Labs
					</a>
				</div>
				<ul className="flex w-full list-none items-center justify-center gap-6 text-sm md:justify-end">
					<li className="ml-4">
						<Link className="text-sidebar" href="/licenses">
							Licenses
						</Link>
					</li>
					<div className="h-full border-r border-sidebar" />
					<li>
						<a href="https://eactda.org/" target="_blank" rel="noreferrer">
							<Image src={EactdaLogo} alt="EACTDA Logo" height={36} />
						</a>
					</li>
					<li>
						<a href="https://byronlabs.io/" target="_blank" rel="noreferrer">
							<Image src={ByronLogo} alt="Byron Labs Logo" height={28} />
						</a>
					</li>
				</ul>
			</div>
		</footer>
	);
}
