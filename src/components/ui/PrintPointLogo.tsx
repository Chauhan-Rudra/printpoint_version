import React from 'react';
import { Creator4Logo, type Creator4LogoProps } from '../Creator4Logo';

/**
 * PrintPointLogo
 *
 * Canonical Print Point design-system wrapper around the existing authentic
 * unmodified Print Point logo asset (`Creator4Logo`).
 */
export type PrintPointLogoProps = Creator4LogoProps;

export const PrintPointLogo: React.FC<PrintPointLogoProps> = (props) => {
  return <Creator4Logo {...props} />;
};
