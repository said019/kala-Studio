import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import ClientLayout from "@/components/layout/ClientLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Copy, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ReferFriends = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["referral-code"],
    queryFn: async () => (await api.get("/referrals/code")).data,
  });

  const ref = data?.data ?? data ?? null;

  const copy = () => {
    if (ref?.code) {
      navigator.clipboard.writeText(ref.code);
      toast({ title: "Código copiado" });
    }
  };

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="max-w-md space-y-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/app/profile")}>
            <ArrowLeft size={16} className="mr-2" />Perfil
          </Button>
          <h1 className="text-xl font-bold">Referir amigos</h1>
          {isLoading ? (
            <Skeleton className="h-48 w-full rounded-xl" />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users size={18} className="text-primary" />
                  Tu código de referido
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input value={ref?.code ?? ""} readOnly className="font-mono text-lg font-bold tracking-widest" />
                  <Button variant="outline" onClick={copy}><Copy size={16} /></Button>
                </div>
                <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
                  <p className="font-medium">¿Cómo funciona?</p>
                  <p className="text-muted-foreground">
                    Comparte tu código con amigos. Cuando activen su primera membresía,
                    recibirás <strong>{ref?.reward_points ?? "puntos de lealtad"}</strong> automáticamente.
                  </p>
                </div>
                {ref?.uses_count != null && (
                  <p className="text-sm text-muted-foreground text-center">
                    {ref.uses_count} {ref.uses_count === 1 ? "persona ha usado" : "personas han usado"} tu código
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </ClientLayout>
    </ClientAuthGuard>
  );
};

export default ReferFriends;
