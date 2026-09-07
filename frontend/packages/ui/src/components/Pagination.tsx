import * as React from 'react';
import { Button } from './Button';

export interface PaginationProps {
  page: number; // zero-based, matching CONTRACT.md §4 (`?page=0&size=20`)
  size: number;
  totalPages: number;
  totalElements: number;
  onPageChange: (page: number) => void;
  previousLabel: string;
  nextLabel: string;
  pageLabel: string;
  ofLabel: string;
  resultCountLabel: string;
}

export function Pagination({
  page,
  totalPages,
  totalElements,
  onPageChange,
  previousLabel,
  nextLabel,
  pageLabel,
  ofLabel,
  resultCountLabel,
}: PaginationProps): React.JSX.Element {
  return (
    <nav className="lx-pagination" aria-label={pageLabel}>
      <span className="lx-pagination__summary">
        {resultCountLabel} · {pageLabel} {page + 1} {ofLabel} {Math.max(totalPages, 1)} ({totalElements})
      </span>
      <div className="lx-pagination__controls">
        <Button
          type="button"
          variant="secondary"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 0}
          aria-label={previousLabel}
        >
          {previousLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onPageChange(page + 1)}
          disabled={page + 1 >= totalPages}
          aria-label={nextLabel}
        >
          {nextLabel}
        </Button>
      </div>
    </nav>
  );
}
