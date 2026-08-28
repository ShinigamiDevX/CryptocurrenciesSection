type Props = {
    theme?: "light" | "dark";
    rounded?: boolean;
};

export default function Loading({ theme, rounded }: Props) {
    return (
        <div className="flex h-full flex-auto">
            <div
                className={`w-full animate-pulse ${theme === "dark" ? "bg-gray-300" : "bg-gray-300"} ${rounded ? "rounded-full" : "rounded-md"}`}
            />
        </div>
    );
}
