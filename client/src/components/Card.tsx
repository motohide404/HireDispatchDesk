import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
  className?: string;
};

type CardSectionProps = {
  children: ReactNode;
  className?: string;
};

const merge = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

export function Card({ children, className }: CardProps) {
  return (
    <div className={merge("rounded-2xl border border-slate-200 bg-white shadow-sm", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardSectionProps) {
  return <div className={merge("px-6 py-5 border-b border-slate-200", className)}>{children}</div>;
}

export function CardContent({ children, className }: CardSectionProps) {
  return <div className={merge("px-6 py-5", className)}>{children}</div>;
}

export function CardFooter({ children, className }: CardSectionProps) {
  return <div className={merge("px-6 py-5 border-t border-slate-200", className)}>{children}</div>;
}

export default Card;
