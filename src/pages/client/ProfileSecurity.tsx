import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import { AppShell, PageHeader, Section } from "@/components/app/AppShell";
import { BackLink } from "@/components/app/widgets";
import { ChangePassword } from "@/components/account/ChangePassword";

const ProfileSecurity = () => {
  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <BackLink to="/app/profile" label="Perfil" />
        <PageHeader
          eyebrow="Seguridad"
          title={<>Tu contraseña</>}
          titleAccent="protegida."
          subtitle="Cámbiala cuando quieras. Usa una que solo tú conozcas."
        />

        <Section title="Cambiar contraseña">
          <div className="max-w-md">
            <ChangePassword />
          </div>
        </Section>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default ProfileSecurity;
