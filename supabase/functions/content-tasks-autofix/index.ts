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
      .select("id, title, kanban_column, drive_link, recording_id")
      .in("kanban_column", ["captacao", "captacao_concluida"])
      .not("recording_id", "is", null);

    if (tasksErr) throw tasksErr;

    if (!stuckTasks || stuckTasks.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, scanned: 0, moved: 0, results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const recordingIds = [
      ...new Set(stuckTasks.map((t) => t.recording_id as string)),
    ];

    // 2) Buscar status das gravações vinculadas
    const { data: recs, error: recsErr } = await supabase
      .from("recordings")
      .select("id, status")
      .in("id", recordingIds);

    if (recsErr) throw recsErr;

    const recStatus = new Map(
      (recs ?? []).map((r) => [r.id as string, r.status as string]),
    );

    // 3) Filtrar somente tarefas cuja gravação está concluída
    const toFix = stuckTasks.filter(
      (t) => recStatus.get(t.recording_id as string) === "concluida",
    );

    const results: Array<{
      id: string;
      title: string;
      from: string;
      to: string;
      ok: boolean;
      error?: string;
    }> = [];

    for (const task of toFix) {
      const target = task.drive_link ? "edicao" : "aguardando_link";
      const { error: updErr } = await supabase
        .from("content_tasks")
        .update({ kanban_column: target })
        .eq("id", task.id);

      results.push({
        id: task.id as string,
        title: task.title as string,
        from: task.kanban_column as string,
        to: target,
        ok: !updErr,
        error: updErr?.message,
      });
    }

    const moved = results.filter((r) => r.ok).length;

    console.log(
      `[content-tasks-autofix] scanned=${stuckTasks.length} candidates=${toFix.length} moved=${moved}`,
    );

    return new Response(
      JSON.stringify({
        ok: true,
        scanned: stuckTasks.length,
        candidates: toFix.length,
        moved,
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
