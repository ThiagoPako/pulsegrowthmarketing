import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { action, client_id, recording_id, new_date, new_time } = await req.json();

    if (!client_id) {
      return new Response(JSON.stringify({ error: "client_id required" }), { status: 400, headers: corsHeaders });
    }

    // ACTION: list recordings for this client
    if (action === "list") {
      const { data: recordings, error } = await adminClient
        .from("recordings")
        .select("id, client_id, videomaker_id, date, start_time, status, type, confirmation_status")
        .eq("client_id", client_id)
        .neq("status", "cancelada")
        .order("date", { ascending: true });

      if (error) throw error;

      // Get videomaker names
      const vmIds = [...new Set((recordings || []).map((r: any) => r.videomaker_id))];
      let vmNames: Record<string, string> = {};
      if (vmIds.length > 0) {
        const { data: profiles } = await adminClient
          .from("profiles")
          .select("id, name, avatar_url")
          .in("id", vmIds);
        if (profiles) {
          profiles.forEach((p: any) => { vmNames[p.id] = p.name; });
        }
      }

      const enriched = (recordings || []).map((r: any) => ({
        ...r,
        videomaker_name: vmNames[r.videomaker_id] || "Videomaker",
      }));

      return new Response(JSON.stringify({ recordings: enriched }), { headers: corsHeaders });
    }

    // ACTION: check availability for a videomaker on a specific date
    if (action === "check_availability") {
      if (!new_date) {
        return new Response(JSON.stringify({ error: "new_date required" }), { status: 400, headers: corsHeaders });
      }

      // Get client's videomaker
      const { data: clientData } = await adminClient
        .from("clients")
        .select("videomaker_id")
        .eq("id", client_id)
        .single();

      if (!clientData?.videomaker_id) {
        return new Response(JSON.stringify({ error: "Nenhum videomaker atribuído" }), { status: 400, headers: corsHeaders });
      }

      const videomakerId = clientData.videomaker_id;

      // Get company settings for duration
      const { data: settings } = await adminClient
        .from("company_settings")
        .select("*")
        .limit(1)
        .single();

      const duration = (settings?.recording_duration || 2) * 60; // minutes
      const buffer = 30;
      const shiftAStart = settings?.shift_a_start || "08:30";
      const shiftBStart = settings?.shift_b_start || "14:30";
      const shiftAEnd = settings?.shift_a_end || "12:00";
      const shiftBEnd = settings?.shift_b_end || "18:00";

      // Get existing recordings for this videomaker on that date
      const { data: existing } = await adminClient
        .from("recordings")
        .select("start_time, date")
        .eq("videomaker_id", videomakerId)
        .eq("date", new_date)
        .neq("status", "cancelada");

      const occupied = (existing || []).map((r: any) => {
        const [h, m] = r.start_time.split(":").map(Number);
        const start = h * 60 + m;
        return { start, end: start + duration + buffer };
      });

      // Generate available slots
      const slots: string[] = [];
      const generateSlots = (startStr: string, endStr: string) => {
        const [sh, sm] = startStr.split(":").map(Number);
        const [eh, em] = endStr.split(":").map(Number);
        let cursor = sh * 60 + sm;
        const endMin = eh * 60 + em;

        while (cursor + duration <= endMin) {
          const conflict = occupied.some(o =>
            (cursor < o.end && cursor + duration + buffer > o.start)
          );
          if (!conflict) {
            const hh = String(Math.floor(cursor / 60)).padStart(2, "0");
            const mm = String(cursor % 60).padStart(2, "0");
            slots.push(`${hh}:${mm}`);
          }
          cursor += 30; // check every 30min
        }
      };

      generateSlots(shiftAStart, shiftAEnd);
      generateSlots(shiftBStart, shiftBEnd);

      // Get videomaker name
      const { data: vmProfile } = await adminClient
        .from("profiles")
        .select("name")
        .eq("id", videomakerId)
        .single();

      return new Response(JSON.stringify({
        available_slots: slots,
        videomaker_name: vmProfile?.name || "Videomaker",
        videomaker_id: videomakerId,
        date: new_date,
      }), { headers: corsHeaders });
    }

    // ACTION: request reschedule
    if (action === "reschedule") {
      if (!recording_id || !new_date || !new_time) {
        return new Response(JSON.stringify({ error: "recording_id, new_date, new_time required" }), { status: 400, headers: corsHeaders });
      }

      // Verify the recording belongs to this client
      const { data: rec } = await adminClient
        .from("recordings")
        .select("id, client_id, videomaker_id, date, start_time")
        .eq("id", recording_id)
        .eq("client_id", client_id)
        .single();

      if (!rec) {
        return new Response(JSON.stringify({ error: "Gravação não encontrada" }), { status: 404, headers: corsHeaders });
      }

      // Verify the new slot is still available
      const { data: settings } = await adminClient
        .from("company_settings")
        .select("recording_duration")
        .limit(1)
        .single();
      const duration = (settings?.recording_duration || 2) * 60;
      const buffer = 30;

      const { data: conflicts } = await adminClient
        .from("recordings")
        .select("id, start_time")
        .eq("videomaker_id", rec.videomaker_id)
        .eq("date", new_date)
        .neq("status", "cancelada")
        .neq("id", recording_id);

      const [nh, nm] = new_time.split(":").map(Number);
      const newStart = nh * 60 + nm;
      const newEnd = newStart + duration + buffer;

      const hasConflict = (conflicts || []).some((c: any) => {
        const [ch, cm] = c.start_time.split(":").map(Number);
        const cStart = ch * 60 + cm;
        const cEnd = cStart + duration + buffer;
        return newStart < cEnd && newEnd > cStart;
      });

      if (hasConflict) {
        return new Response(JSON.stringify({ error: "Horário não está mais disponível" }), { status: 409, headers: corsHeaders });
      }

      // Update the recording
      const { error } = await adminClient
        .from("recordings")
        .update({
          date: new_date,
          start_time: new_time,
          confirmation_status: "pendente",
        })
        .eq("id", recording_id);

      if (error) throw error;

      // Get client name for notification
      const { data: clientInfo } = await adminClient
        .from("clients")
        .select("company_name")
        .eq("id", client_id)
        .single();

      // Notify admin and social_media about the reschedule
      const oldDate = rec.date;
      const oldTime = rec.start_time;
      
      await adminClient.rpc("notify_role", {
        _role: "admin",
        _title: "Reagendamento pelo cliente",
        _message: `${clientInfo?.company_name} reagendou gravação de ${oldDate} ${oldTime} para ${new_date} ${new_time}`,
        _type: "warning",
        _link: "/agenda",
      });

      await adminClient.rpc("notify_role", {
        _role: "social_media",
        _title: "Reagendamento pelo cliente",
        _message: `${clientInfo?.company_name} reagendou gravação de ${oldDate} ${oldTime} para ${new_date} ${new_time}`,
        _type: "warning",
        _link: "/agenda",
      });

      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: corsHeaders });
  } catch (err) {
    console.error("Portal recordings error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
