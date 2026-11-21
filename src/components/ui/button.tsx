import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white shadow-[0_8px_18px_rgba(23,59,87,0.16)] hover:bg-primary/90",
  secondary: "border border-secondary/25 bg-secondary/10 text-secondary hover:bg-secondary/15",
  ghost: "text-muted hover:bg-sage/60 hover:text-primary",
  danger: "border border-danger/25 bg-danger/8 text-danger hover:bg-danger/12",
};

const sizeClasses = {
  sm: "min-h-9 px-3 text-xs",
  md: "min-h-11 px-4 text-sm",
  lg: "min-h-12 px-5 text-sm",
};

export function Button({ className = "", variant = "primary", size = "md", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    />
  );
}
