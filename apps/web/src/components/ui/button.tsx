import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Кнопки дизайн-системы Re-Apple Emerald 2.0.
 * primary — одно главное действие экрана; secondary — спокойная альтернатива;
 * inverse / inverseOutline — поверх фото (hero); ghost/link — текстовые.
 * Цвет только из токенов (--primary, --primary-hover, --border), без HEX.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap select-none transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground font-semibold hover:bg-primary-hover",
        secondary:
          "bg-card text-foreground border border-border font-medium hover:border-primary/40 hover:bg-surface-soft",
        inverse: "bg-white text-foreground font-semibold hover:bg-white/90",
        inverseOutline:
          "bg-white/10 text-white border border-white/40 font-medium backdrop-blur-sm hover:bg-white/20",
        ghost:
          "bg-transparent text-primary font-medium border-0 shadow-none hover:underline underline-offset-4",
        default: "bg-primary text-primary-foreground font-semibold hover:bg-primary-hover",
        destructive: "bg-destructive text-destructive-foreground font-semibold hover:opacity-90",
        outline:
          "bg-card text-foreground border border-border font-medium hover:border-primary/40 hover:bg-surface-soft",
        link: "text-primary underline-offset-4 hover:underline font-medium",
      },
      size: {
        md: "h-12 sm:h-11 rounded-lg px-5 text-[15px]",
        default: "h-12 sm:h-11 rounded-lg px-5 text-[15px]",
        sm: "h-9 rounded-lg px-3.5 text-[13px] font-medium",
        lg: "h-12 rounded-lg px-7 text-base",
        icon: "h-11 w-11 rounded-lg p-0",
      },
    },
    compoundVariants: [
      {
        variant: ["ghost", "link"],
        className: "!h-auto !min-h-0 !px-0 !py-0 !rounded-none text-sm",
      },
      {
        variant: "ghost",
        size: "sm",
        className: "text-sm",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
