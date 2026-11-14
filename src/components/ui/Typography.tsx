import React from 'react';

interface TypographyProps {
  children: React.ReactNode;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'div' | 'label';
  htmlFor?: string;
}

export const PageHeading: React.FC<TypographyProps> = ({
  children,
  className = '',
  as: Tag = 'h1',
}) => <Tag className={`pp-text-page-heading ${className}`}>{children}</Tag>;

export const SectionHeading: React.FC<TypographyProps> = ({
  children,
  className = '',
  as: Tag = 'h2',
}) => <Tag className={`pp-text-section-heading ${className}`}>{children}</Tag>;

export const CardHeading: React.FC<TypographyProps> = ({
  children,
  className = '',
  as: Tag = 'h3',
}) => <Tag className={`pp-text-card-heading ${className}`}>{children}</Tag>;

export const BodyText: React.FC<TypographyProps> = ({
  children,
  className = '',
  as: Tag = 'p',
}) => <Tag className={`pp-text-body ${className}`}>{children}</Tag>;

export const SecondaryText: React.FC<TypographyProps> = ({
  children,
  className = '',
  as: Tag = 'p',
}) => <Tag className={`pp-text-secondary ${className}`}>{children}</Tag>;

export const LabelText: React.FC<TypographyProps> = ({
  children,
  className = '',
  as: Tag = 'label',
  htmlFor,
}) => (
  <Tag htmlFor={htmlFor} className={`pp-text-label ${className}`}>
    {children}
  </Tag>
);

export const FinancialValue: React.FC<TypographyProps> = ({
  children,
  className = '',
  as: Tag = 'span',
}) => <Tag className={`pp-text-financial ${className}`}>{children}</Tag>;

export const DocumentMetaText: React.FC<{
  parts: Array<string | number | undefined | null | false>;
  className?: string;
}> = ({ parts, className = '' }) => {
  const cleanParts = parts.filter(
    (p): p is string | number => p !== undefined && p !== null && p !== false && String(p).trim() !== ''
  );

  return (
    <span className={`pp-text-doc-meta inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${className}`}>
      {cleanParts.map((part, idx) => (
        <React.Fragment key={`${idx}-${String(part)}`}>
          {idx > 0 && <span aria-hidden="true">·</span>}
          <span>{part}</span>
        </React.Fragment>
      ))}
    </span>
  );
};
