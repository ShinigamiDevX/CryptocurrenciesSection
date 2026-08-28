"use client";

import usePagination from "$src/app/hooks/usePagination";
import { useEffect, useState } from "react";

type Props = {
    onPageChange: (page: number) => void;
    totalCount: number;
    currentPage: number;
    pageSize: number;
};
export default function Pagination({ onPageChange, totalCount, currentPage, pageSize }: Props) {
    const [hasPages, setHasPages] = useState(false);

    const paginationRange = usePagination({
        currentPage,
        totalCount,
        pageSize,
    });

    useEffect(() => {
        setHasPages(currentPage !== 0 || paginationRange.length > 1);
    }, [currentPage, paginationRange]);

    const onNext = () => {
        onPageChange(currentPage + 1);
    };

    const onPrevious = () => {
        onPageChange(currentPage - 1);
    };

    const lastPage = paginationRange[paginationRange.length - 1];
    return (
        <>
            {hasPages && (
                <ul className="pagination-container pagination-bar">
                    <li className={`pagination-item ${currentPage === 1 ? "disabled" : ""}`} onClick={onPrevious}>
                        <div className="arrow left" />
                    </li>
                    {paginationRange.map((pageNumber, index) => {
                        if (pageNumber === "...") {
                            return (
                                <li key={`${index} dots`} className="pagination-item dots">
                                    &#8230;
                                </li>
                            );
                        }

                        return (
                            <li
                                className={`pagination-item ${pageNumber === currentPage ? "selected" : ""}`}
                                key={pageNumber}
                                onClick={() => {
                                    if (typeof pageNumber === "number") onPageChange(pageNumber);
                                }}
                            >
                                {pageNumber}
                            </li>
                        );
                    })}
                    <li
                        key="last"
                        className={`pagination-item ${currentPage === lastPage ? "disabled" : ""}`}
                        onClick={onNext}
                    >
                        <div className="arrow right" />
                    </li>
                </ul>
            )}
        </>
    );
}
