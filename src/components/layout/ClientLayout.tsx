import { type ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";

type ClientLayoutProps = {
  children: ReactNode;
  hideGreeting?: boolean;
};

const ClientLayout = ({ children, hideGreeting }: ClientLayoutProps) => (
  <AppShell hideGreeting={hideGreeting}>{children}</AppShell>
);

export default ClientLayout;
