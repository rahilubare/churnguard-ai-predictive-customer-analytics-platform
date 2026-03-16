import { cn } from "@/lib/utils";

interface SkipLinkProps {
  className?: string;
}

export function SkipLink({ className }: SkipLinkProps) {
  return (
    <a
      href="#main-content"
      className={cn(
        "sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:rounded-md focus:shadow-elevation-lg",
        className
      )}
    >
      Skip to main content
    </a>
  );
}
