import type { SVGProps } from 'react';

/**
 * Знак «VK» вместо безликой иконки «люди»: lucide не рисует логотипы соцсетей.
 * Принимает те же className/strokeWidth, что и иконки lucide (strokeWidth игнорируется).
 */
const VkIcon = ({ strokeWidth: _sw, ...props }: SVGProps<SVGSVGElement> & { strokeWidth?: number | string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
    <text
      x="12"
      y="16.2"
      textAnchor="middle"
      fontSize="11.5"
      fontWeight="800"
      fontFamily="Inter, Arial, Helvetica, sans-serif"
      letterSpacing="-0.4"
    >
      VK
    </text>
  </svg>
);

export default VkIcon;
