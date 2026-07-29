"use client";

import { AuthProvider } from "@/providers/auth-provider";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { QueryProvider } from "@/providers/query-provider";

type AppProvidersProps = {
  children: React.ReactNode;
};

export function AppProviders({
  children,
}: AppProvidersProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <AuthProvider>
        <QueryProvider>
          {children}

          <Toaster
            richColors
            position="top-right"
          />
        </QueryProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
