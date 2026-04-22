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

    // 1) Buscar TODAS as tarefas em captacao*/captacao_concluida (com ou sem recording)
    //    para detectar 3 cenários:
    //    a) recording concluída → mover p/ edicao ou aguardando_link
    //    b) recording cancelada → mover p/ ideias (script volta) ou cancelado
    //    c) órfã: sem recording_id ou recording inexistente/agendada sem active_recording
    //       → devolver para "ideias" para o videomaker re-selecionar
    const { data: stuckTasks, error: tasksErr } = await supabase
      .from("content_tasks")
      .select("id, title, kanban_column, drive_link, recording_id, content_type, script_id, updated_at")
      .in("kanban_column", ["captacao", "captacao_concluida"]);

    if (tasksErr) throw tasksErr;

    const emptyStats = {
      moved: 0,
      cancelled: 0,
      extras: 0,
      orphans: 0,
      byVideomaker: {} as Record<string, { name: string; moved: number; cancelled: number; extras: number; orphans: number }>,
    };

    if (!stuckTasks || stuckTasks.length === 0) {
      console.log("[content-tasks-autofix] nada a fazer (0 candidatas)");
      return new Response(
        JSON.stringify({ ok: true, scanned: 0, moved: 0, skipped: 0, results: [], stats: emptyStats }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const recordingIds = [
      ...new Set(
        stuckTasks
          .map((t) => t.recording_id as string | null)
          .filter((v): v is string => !!v),
      ),
    ];

    // 2) Buscar gravações vinculadas
    const { data: recs } = recordingIds.length > 0
      ? await supabase
          .from("recordings")
          .select("id, status, videomaker_id")
          .in("id", recordingIds)
      : { data: [] as Array<{ id: string; status: string; videomaker_id: string | null }> };

    const recInfo = new Map(
      (recs ?? []).map((r) => [
        r.id as string,
        { status: r.status as string, videomaker_id: (r as any).videomaker_id as string | null },
      ]),
    );

    // 2.a) Buscar active_recordings para detectar gravações ATUALMENTE em curso
    //      Tasks cuja recording está "agendada" mas tem active_recording → captação real, não mexer.
    //      Tasks cuja recording está "agendada" SEM active_recording → órfã (limpar).
    const { data: activeRecs } = recordingIds.length > 0
      ? await supabase
          .from("active_recordings")
          .select("recording_id")
          .in("recording_id", recordingIds)
      : { data: [] as Array<{ recording_id: string }> };
    const activeRecIds = new Set((activeRecs ?? []).map((a) => a.recording_id as string));

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

    // 3) Classificar cada task em uma ação:
    //    - "concluida"  → drive_link decide (edicao | aguardando_link)
    //    - "cancelada"  → ideias (cancelada explicitamente)
    //    - "órfã"       → ideias (sem recording, sem active_recording, ou recording inexistente)
    type Action = "concluida" | "cancelada" | "orfa";
    const toFix: Array<{ task: typeof stuckTasks[number]; action: Action; vmId: string | null; vmName: string | null; recStatus: string }> = [];
    for (const t of stuckTasks) {
      const recId = t.recording_id as string | null;
      const meta = recId ? recInfo.get(recId) : undefined;
      const recStatus = meta?.status ?? "";
      const vmId = meta?.videomaker_id ?? null;
      const vmName = vmId ? (vmNames.get(vmId) ?? "Videomaker") : null;

      if (meta?.status === "concluida") {
        toFix.push({ task: t, action: "concluida", vmId, vmName, recStatus });
      } else if (meta?.status === "cancelada") {
        toFix.push({ task: t, action: "cancelada", vmId, vmName, recStatus });
      } else if (!recId || !meta) {
        // Sem recording_id OU recording deletado → órfã
        toFix.push({ task: t, action: "orfa", vmId: null, vmName: null, recStatus: "" });
      } else if (meta.status === "agendada" && !activeRecIds.has(recId)) {
        // Recording agendada mas ninguém gravando agora → captação interrompida/órfã
        toFix.push({ task: t, action: "orfa", vmId, vmName, recStatus });
      }
      // demais casos (agendada com active_recording, organizando_material) → captação real, não mexer
    }

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
      videomaker_id?: string | null;
      videomaker_name?: string | null;
      recording_status?: string;
      is_extra?: boolean;
    }> = [];

    let skipped = 0;
    let warnings = 0;

    // Stats por videomaker (apenas tarefas efetivamente alteradas)
    const byVideomaker: Record<
      string,
      { name: string; moved: number; cancelled: number; extras: number }
    > = {};
    let cancelledTotal = 0;
    let extrasTotal = 0;

    const bumpVm = (
      vmId: string | null,
      vmName: string | null,
      key: "moved" | "cancelled" | "extras",
    ) => {
      const id = vmId ?? "__unknown__";
      const name = vmName ?? "Sem videomaker";
      if (!byVideomaker[id]) byVideomaker[id] = { name, moved: 0, cancelled: 0, extras: 0 };
      byVideomaker[id][key]++;
    };

    // ─── Validação de drive_link ───────────────────────────────────────
    const isValidDriveLink = (raw: unknown): boolean => {
      if (typeof raw !== "string") return false;
      const v = raw.trim();
      if (v.length < 8) return false;
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
      const recordingId = task.recording_id as string;
      const recMeta = recInfo.get(recordingId);
      const recStatusVal = recMeta?.status ?? "";
      const vmId = recMeta?.videomaker_id ?? null;
      const vmName = vmId ? (vmNames.get(vmId) ?? "Videomaker") : null;
      const isCancelled = recStatusVal === "cancelada";
      const contentType = (task as any).content_type as string | undefined;
      const isExtra = contentType === "extra" || contentType === "extras";

      // Decide alvo + motivo
      let target: "edicao" | "aguardando_link" | "cancelado";
      let reason: string;
      let warning: string | undefined;

      if (isCancelled) {
        target = "cancelado";
        reason = "gravação cancelada → mover para coluna cancelado";
      } else if (linkOk) {
        target = "edicao";
        reason = "drive_link válido → liberar para edição";
      } else {
        target = "aguardando_link";
        if (rawLink && rawLink.trim().length > 0) {
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

      // ─── IDEMPOTÊNCIA ───
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
          videomaker_id: vmId,
          videomaker_name: vmName,
          recording_status: recStatusVal,
          is_extra: isExtra,
        });
        continue;
      }

      const { data: updated, error: updErr } = await supabase
        .from("content_tasks")
        .update({ kanban_column: target })
        .eq("id", task.id)
        .eq("kanban_column", currentColumn)
        .select("id");

      const wasUpdated = !updErr && (updated?.length ?? 0) > 0;
      if (!wasUpdated && !updErr) skipped++;

      if (wasUpdated) {
        bumpVm(vmId, vmName, "moved");
        if (isCancelled) {
          cancelledTotal++;
          bumpVm(vmId, vmName, "cancelled");
        }
        if (isExtra) {
          extrasTotal++;
          bumpVm(vmId, vmName, "extras");
        }
      }

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
        videomaker_id: vmId,
        videomaker_name: vmName,
        recording_status: recStatusVal,
        is_extra: isExtra,
      });
    }

    const moved = results.filter((r) => r.ok && !r.skipped).length;

    console.log(
      `[content-tasks-autofix] scanned=${stuckTasks.length} candidates=${toFix.length} moved=${moved} cancelled=${cancelledTotal} extras=${extrasTotal} skipped=${skipped} warnings=${warnings}`,
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
        stats: {
          moved,
          cancelled: cancelledTotal,
          extras: extrasTotal,
          byVideomaker,
        },
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
