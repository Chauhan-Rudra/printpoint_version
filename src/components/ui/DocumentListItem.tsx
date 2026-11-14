import React from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import { FileTypeIcon } from '../FileTypeIcon';
import { FileFormatKind } from '../../types/kiosk';
import { DocumentMetaText } from './Typography';
import { Haptics } from '../../utils/haptics';

export interface DocumentListItemProps {
  fileName: string;
  formatKind?: FileFormatKind;
  metadata?: Array<string | number | undefined | null | false>;
  thumbnail?: React.ReactNode;
  selected?: boolean;
  selectable?: boolean;
  statusNode?: React.ReactNode;
  actions?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export const DocumentListItem: React.FC<DocumentListItemProps> = ({
  fileName,
  formatKind,
  metadata = [],
  thumbnail,
  selected = false,
  selectable = false,
  statusNode,
  actions,
  onClick,
  className = '',
}) => {
  const isInteractive = Boolean(onClick);

  const handleRowClick = () => {
    if (!onClick) return;
    Haptics.selection();
    onClick();
  };

  const content = (
    <>
      {selectable && (
        <div className="shrink-0 flex items-center justify-center">
          {selected ? (
            <CheckCircle size={20} weight="fill" className="text-[#194F34]" aria-hidden="true" />
          ) : (
            <span
              className="w-5 h-5 rounded-full border-2 border-[#C1C9BF] bg-white"
              aria-hidden="true"
            />
          )}
        </div>
      )}

      <div className="shrink-0">
        {thumbnail ?? <FileTypeIcon fileName={fileName} formatKind={formatKind} size="md" />}
      </div>

      <div className="flex flex-col min-w-0 flex-1 text-left">
        <span className="text-[14px] font-semibold text-[#191C1A] leading-snug truncate">
          {fileName}
        </span>

        {metadata.length > 0 && <DocumentMetaText parts={metadata} className="mt-0.5" />}

        {statusNode && <div className="mt-1">{statusNode}</div>}
      </div>

      {actions && (
        <div
          className="flex items-center gap-1 shrink-0"
          onClick={(e) => {
            if (isInteractive) e.stopPropagation();
          }}
        >
          {actions}
        </div>
      )}
    </>
  );

  const containerClasses = `w-full min-h-[60px] p-3 rounded-2xl border transition-colors duration-150 flex items-center gap-3 min-w-0 ${
    selected
      ? 'bg-[#F4F8F5] border-[#194F34]'
      : 'bg-white border-[#D5DDD7]'
  } ${isInteractive ? 'hover:border-[#194F34]/40 cursor-pointer active:bg-[#F8FAF6]' : ''} ${className}`;

  if (isInteractive) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleRowClick();
          }
        }}
        aria-pressed={selectable ? selected : undefined}
        className={containerClasses}
      >
        {content}
      </div>
    );
  }

  return <div className={containerClasses}>{content}</div>;
};
