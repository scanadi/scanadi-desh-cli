import { cva, type VariantProps } from "class-variance-authority";
import { Check } from "lucide-react";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground",
        outline: "border border-input bg-background",
        ghost: "hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        sm: "h-9 rounded-md px-3",
        default: "h-10 px-4 py-2",
        lg: "h-11 rounded-lg px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps extends VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  disabled?: boolean;
}
