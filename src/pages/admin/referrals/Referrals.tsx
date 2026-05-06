import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ReferralCode {
  id: string;
  code: string;
  user_id: string;
  uses_count: number;
  max_uses: number | null;
  reward_points: number;
  is_active: boolean;
}

interface Referral {
  id: string;
  referrer_name: string;
  referred_name: string;
  status: "pending" | "completed";
  points_awarded: number;
  completed_at: string | null;
}

interface Stats {
  totalReferrals: number;
  completedReferrals: number;
  totalPointsAwarded: number;
}

const Referrals = () => {
  const { data: codes } = useQuery<{ data: ReferralCode[] }>({
    queryKey: ["referral-codes"],
    queryFn: async () => (await api.get("/referrals/codes")).data,
  });

  const { data: referrals } = useQuery<{ data: Referral[] }>({
    queryKey: ["referrals"],
    queryFn: async () => (await api.get("/referrals")).data,
  });

  const { data: statsData } = useQuery<{ data: Stats }>({
    queryKey: ["referrals-stats"],
    queryFn: async () => (await api.get("/referrals/stats")).data,
  });

  const stats: Stats | undefined = statsData?.data ?? (statsData as unknown as Stats);

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-5xl">
          <h1 className="text-2xl font-bold mb-6">Referidos</h1>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Total referidos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{stats?.totalReferrals ?? 0}</p></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Completados</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{stats?.completedReferrals ?? 0}</p></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Puntos otorgados</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{stats?.totalPointsAwarded ?? 0}</p></CardContent></Card>
          </div>

          <Tabs defaultValue="referrals">
            <TabsList>
              <TabsTrigger value="referrals">Relaciones</TabsTrigger>
              <TabsTrigger value="codes">Códigos</TabsTrigger>
            </TabsList>
            <TabsContent value="referrals" className="mt-4">
              <Table>
                <TableHeader><TableRow><TableHead>Referidor</TableHead><TableHead>Referido</TableHead><TableHead>Estado</TableHead><TableHead>Puntos</TableHead><TableHead>Completado</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(Array.isArray(referrals?.data) ? referrals.data : []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.referrer_name}</TableCell>
                      <TableCell>{r.referred_name}</TableCell>
                      <TableCell><Badge variant={r.status === "completed" ? "default" : "outline"}>{r.status}</Badge></TableCell>
                      <TableCell>{r.points_awarded}</TableCell>
                      <TableCell className="text-sm">{r.completed_at ? new Date(r.completed_at).toLocaleDateString("es-MX") : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="codes" className="mt-4">
              <Table>
                <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Usos</TableHead><TableHead>Máx. usos</TableHead><TableHead>Puntos</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
                <TableBody>
                  {(Array.isArray(codes?.data) ? codes.data : []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-bold">{c.code}</TableCell>
                      <TableCell>{c.uses_count}</TableCell>
                      <TableCell>{c.max_uses ?? "∞"}</TableCell>
                      <TableCell>{c.reward_points}</TableCell>
                      <TableCell><Badge variant={c.is_active ? "default" : "secondary"}>{c.is_active ? "Activo" : "Inactivo"}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default Referrals;
