// Edge Function: content-tasks-autofix
// Roda periodicamente (cron 1x/min) e corrige tarefas do Kanban de Conteúdo
// que ficaram presas em "captacao" / "captacao_concluida" após a gravação ser
// finalizada — movendo para "edicao" (se há drive_link) ou "aguardando_link".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // 1) Buscar tarefas candidatas (presas em captacao* com recording_id)
    const { data: stuckTasks, error: tasksErr } = await supabase
      .from("content_tasks")
      .select("id, title, kanban_column, drive_link, recording_id, content_type")
      .in("kanban_column", ["captacao", "captacao_concluida"])
      .not("recording_id", "is", null);

    if (tasksErr) throw tasksErr;

    const emptyStats = {
      moved: 0,
      cancelled: 0,
      extras: 0,
      byVideomaker: {} as Record<string, { name: string; moved: number; cancelled: number; extras: number }>,
    };

    if (!stuckTasks || stuckTasks.length === 0) {
      console.log("[content-tasks-autofix] nada a fazer (0 candidatas)");
      return new Response(
        JSON.stringify({ ok: true, scanned: 0, moved: 0, skipped: 0, results: [], stats: emptyStats }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const recordingIds = [
      ...new Set(stuckTasks.map((t) => t.recording_id as string)),
    ];

    // 2) Buscar gravações vinculadas (status + videomaker)
    const { data: recs, error: recsErr } = await supabase
      .from("recordings")
      .select("id, status, videomaker_id")
      .in("id", recordingIds);

    if (recsErr) throw recsErr;

    const recInfo = new Map(
      (recs ?? []).map((r) => [
        r.id as string,
        { status: r.status as string, videomaker_id: (r as any).videomaker_id as string | null },
      ]),
    );

    // 2.b) Resolver nomes dos videomakers
    const vmIds = [
      ...new Set(
        (recs ?? [])
          .map((r) => (r as any).videomaker_id as string | null)
          .filter((v): v is string => !!v),
      ),
    ];
    const vmNames = new Map<string, string>();
    if (vmIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", vmIds);
      for (const p of profs ?? []) vmNames.set(p.id as string, (p as any).name ?? "Videomaker");
    }

    // 3) Filtrar somente tarefas cuja gravação está concluída ou cancelada
    const toFix = stuckTasks.filter((t) => {
      const st = recInfo.get(t.recording_id as string)?.status;
      return st === "concluida" || st === "cancelada";
    });

    const results: Array<{
      id: string;
      title: string;
      from: string;
      to: string;
      ok: boolean;
      skipped?: boolean;
      reason?: string;
      warning?: string;
      error?: string;
    }> = [];

    let skipped = 0;
    let warnings = 0;

    // ─── Validação de drive_link ───────────────────────────────────────
    // Aceita http(s) ou URLs do Google Drive sem protocolo (drive.google.com/...)
    const isValidDriveLink = (raw: unknown): boolean => {
      if (typeof raw !== "string") return false;
      const v = raw.trim();
      if (v.length < 8) return false;
      // tenta parsear como URL completa
      try {
        const u = new URL(v.startsWith("http") ? v : `https://${v}`);
        return !!u.hostname && u.hostname.includes(".");
      } catch {
        return false;
      }
    };

    for (const task of toFix) {
      const currentColumn = task.kanban_column as string;
      const rawLink = task.drive_link as string | null;
      const linkOk = isValidDriveLink(rawLink);

      // Decide alvo + motivo
      let target: "edicao" | "aguardando_link";
      let reason: string;
      let warning: string | undefined;

      if (linkOk) {
        target = "edicao";
        reason = "drive_link válido → liberar para edição";
      } else {
        target = "aguardando_link";
        if (rawLink && rawLink.trim().length > 0) {
          // Link existe mas é inconsistente (ex: texto solto, URL malformada)
          warning = `drive_link inconsistente (não é URL válida): "${String(rawLink).slice(0, 80)}"`;
          reason = "drive_link inválido → manter aguardando link correto";
          warnings++;
          console.warn(
            `[content-tasks-autofix] task=${task.id} título="${task.title}" ${warning}`,
          );
        } else {
          reason = "sem drive_link → aguardando upload do videomaker";
        }
      }

      // ─── IDEMPOTÊNCIA: se a tarefa já está na coluna alvo, não faz nada ───
      if (currentColumn === target) {
        skipped++;
        results.push({
          id: task.id as string,
          title: task.title as string,
          from: currentColumn,
          to: target,
          ok: true,
          skipped: true,
          reason,
          warning,
        });
        continue;
      }

      // UPDATE condicional: só altera se a coluna no banco AINDA for a antiga
      // (evita race condition se outro processo já moveu o card)
      const { data: updated, error: updErr } = await supabase
        .from("content_tasks")
        .update({ kanban_column: target })
        .eq("id", task.id)
        .eq("kanban_column", currentColumn)
        .select("id");

      const wasUpdated = !updErr && (updated?.length ?? 0) > 0;
      if (!wasUpdated && !updErr) skipped++;

      results.push({
        id: task.id as string,
        title: task.title as string,
        from: currentColumn,
        to: target,
        ok: !updErr,
        skipped: !wasUpdated && !updErr,
        reason,
        warning,
        error: updErr?.message,
      });
    }

    const moved = results.filter((r) => r.ok && !r.skipped).length;

    console.log(
      `[content-tasks-autofix] scanned=${stuckTasks.length} candidates=${toFix.length} moved=${moved} skipped=${skipped} warnings=${warnings}`,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        scanned: stuckTasks.length,
        candidates: toFix.length,
        moved,
        skipped,
        warnings,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[content-tasks-autofix] erro:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
