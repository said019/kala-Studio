import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  Tag,
  Stat,
  PrimaryButton,
  GhostButton,
  SkeletonRow,
  KALA,
} from "@/components/app/AppShell";
import { BackLink, DataRow, InfoBanner } from "@/components/app/widgets";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Share2 } from "lucide-react";

const ReferFriends = () => {
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["referral-code"],
    queryFn: async () => (await api.get("/referrals/code")).data,
  });

  const ref = data?.data ?? data ?? null;
  const code: string = ref?.code ?? "";
  const usesCount: number = Number(ref?.uses_count ?? 0);
  const rewardPoints = ref?.reward_points;

  const shareLink = code ? `${window.location.origin}/auth/register?ref=${encodeURIComponent(code)}` : "";

  const copyCode = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    toast({ title: "Código copiado." });
  };

  const copyLink = () => {
    if (!shareLink) return;
    navigator.clipboard.writeText(shareLink);
    toast({ title: "Liga copiada." });
  };

  const nativeShare = async () => {
    if (!shareLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Te invito a Kala Barre Studio",
          text: `Usa mi código ${code} y entremos juntas. ${shareLink}`,
          url: shareLink,
        });
      } catch {
        // user cancelled
      }
    } else {
      copyLink();
    }
  };

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <BackLink to="/app/profile" label="Perfil" />
        <PageHeader
          eyebrow="Invita a una amiga"
          title={<>Las dos</>}
          titleAccent="ganan."
          subtitle="Comparte tu código. Cuando ella active su primera membresía, te llegan puntos automáticamente."
        />

        {isLoading ? (
          <SkeletonRow height={220} />
        ) : (
          <Section>
            <div
              className="rounded-3xl p-6 sm:p-8 flex flex-col items-center text-center gap-4"
              style={{ backgroundColor: KALA.blush }}
            >
              <span
                className="grid h-12 w-12 place-items-center rounded-2xl"
                style={{ backgroundColor: KALA.coral, color: KALA.cream }}
              >
                <Sparkles size={20} />
              </span>
              <div>
                <p className="text-[0.62rem] font-medium uppercase tracking-[0.24em]" style={{ color: KALA.berry }}>
                  Tu código
                </p>
                <p
                  className="font-bebas mt-2 tracking-[0.18em] tabular-nums break-all"
                  style={{ color: KALA.ink, fontSize: "clamp(2.2rem, 5vw, 3.4rem)" }}
                >
                  {code || "—"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                <PrimaryButton size="sm" onClick={nativeShare}>
                  <Share2 size={13} />
                  Compartir
                </PrimaryButton>
                <GhostButton onClick={copyCode}>Copiar código</GhostButton>
                {shareLink && <GhostButton onClick={copyLink}>Copiar liga</GhostButton>}
              </div>
            </div>
          </Section>
        )}

        <Section title="Cómo funciona">
          <ul className="list-none m-0 p-0">
            {[
              { tag: "01", text: "Comparte tu código o liga con quien quieras invitar." },
              { tag: "02", text: "Ella se registra y compra su primera membresía." },
              { tag: "03", text: "Te acreditamos los puntos automáticamente en tu wallet." },
            ].map((step, i, arr) => (
              <li
                key={step.tag}
                className="grid grid-cols-[auto_1fr] items-center gap-4 py-4"
                style={{
                  borderTop: `1px solid ${KALA.border}`,
                  borderBottom: i === arr.length - 1 ? `1px solid ${KALA.border}` : undefined,
                }}
              >
                <span className="font-bebas text-[1rem]" style={{ color: KALA.coral }}>
                  {step.tag}
                </span>
                <span className="text-[0.92rem] leading-[1.55]" style={{ color: KALA.ink, opacity: 0.78 }}>
                  {step.text}
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Tu progreso">
          <div className="grid grid-cols-2 gap-5">
            <Stat value={usesCount} label="Personas invitadas" tint="berry" />
            <Stat
              value={rewardPoints ? `+${rewardPoints}` : "—"}
              label="Puntos por referido"
              tint="orange"
            />
          </div>
          {usesCount > 0 && (
            <div className="mt-5">
              <Tag tint="olive">
                {usesCount === 1 ? "1 persona usó tu código" : `${usesCount} personas usaron tu código`}
              </Tag>
            </div>
          )}
        </Section>

        {!code && !isLoading && (
          <Section>
            <InfoBanner
              tone="orange"
              title="Aún no se generó tu código."
              description="Si esto persiste, escríbenos por WhatsApp y lo activamos."
            />
          </Section>
        )}
      </AppShell>
    </ClientAuthGuard>
  );
};

export default ReferFriends;
