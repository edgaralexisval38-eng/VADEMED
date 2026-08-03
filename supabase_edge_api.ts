// ============================================================
//  VadeMed · Edge Function "api"  (Supabase / Deno + TypeScript)
//  Un solo endpoint POST que despacha: "verificar" y "sugerencia".
//  Verify JWT: DESACTIVADO (el auth real es el codigo de acceso).
// ============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Secretos / entorno ---
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY   = Deno.env.get("RESEND_KEY") ?? "";
const INTENTOS_MAX = parseInt(Deno.env.get("INTENTOS_MAX") ?? "10", 10);
const INTENTOS_MIN = parseInt(Deno.env.get("INTENTOS_MINUTOS") ?? "15", 10);

const CORREO_DESTINO = "vademedmx@gmail.com";
const RESEND_FROM    = "VadeMed <onboarding@resend.dev>"; // dominio de pruebas de Resend

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, x-client-info, apikey",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

function getIP(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip = xff.split(",")[0].trim();
  return ip || req.headers.get("x-real-ip") || "0.0.0.0";
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// concordancia de genero correcta en el asunto
function tipoMeta(tipo: string) {
  switch ((tipo || "").toLowerCase()) {
    case "bug":
    case "problema":
      return { emoji: "\u{1F41E}", etiqueta: "Problema", asunto: "[VadeMed] Nuevo problema reportado" };
    case "contacto":
      return { emoji: "✉️", etiqueta: "Contacto", asunto: "[VadeMed] Nuevo contacto" };
    default:
      return { emoji: "\u{1F4A1}", etiqueta: "Sugerencia", asunto: "[VadeMed] Nueva sugerencia" };
  }
}

function plantillaHTML(meta: {emoji: string; etiqueta: string}, mensaje: string, codigo: string, version: string, fecha: string): string {
  return `<!doctype html><html><body style="margin:0;background:#eef2f7;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 14px rgba(20,40,80,.08)">
    <div style="background:#0e1c3f;padding:22px 24px;color:#fff">
      <div style="font-size:18px;font-weight:800;letter-spacing:-.01em">VadeMed</div>
      <div style="font-size:11px;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.12em;margin-top:3px">Buz&oacute;n de sugerencias</div>
    </div>
    <div style="padding:24px">
      <span style="display:inline-block;font-size:13px;font-weight:700;color:#0e1c3f;background:#eaf0fb;padding:5px 12px;border-radius:20px">${meta.emoji} ${meta.etiqueta}</span>
      <div style="margin-top:16px;background:#f7f9fc;border:1px solid #e6ecf5;border-radius:12px;padding:16px;font-size:15px;line-height:1.6;color:#283450;white-space:pre-wrap">${esc(mensaje)}</div>
      <table style="width:100%;margin-top:18px;font-size:13px;color:#6a7488;border-collapse:collapse">
        <tr><td style="padding:5px 0">C&oacute;digo usado</td><td style="text-align:right;color:#283450;font-weight:600">${esc(codigo || "—")}</td></tr>
        <tr><td style="padding:5px 0;border-top:1px solid #eef2f7">Versi&oacute;n</td><td style="text-align:right;color:#283450;font-weight:600;border-top:1px solid #eef2f7">${esc(version || "—")}</td></tr>
        <tr><td style="padding:5px 0;border-top:1px solid #eef2f7">Fecha</td><td style="text-align:right;color:#283450;font-weight:600;border-top:1px solid #eef2f7">${esc(fecha)}</td></tr>
      </table>
    </div>
  </div></body></html>`;
}

async function enviarCorreo(tipo: string, mensaje: string, codigo: string, version: string): Promise<void> {
  const meta = tipoMeta(tipo);
  const fecha = new Date().toLocaleString("es-MX", { timeZone: "America/Mexico_City" });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: RESEND_FROM,
      to: [CORREO_DESTINO.toLowerCase()],   // Resend valida el destinatario case-sensitive
      subject: meta.asunto,
      html: plantillaHTML(meta, mensaje, codigo, version, fecha),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Resend ${res.status}: ${t}`);
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return json({ ok: false, error: "Método no permitido" }, 405);

  let body: any;
  try { body = await req.json(); }
  catch { return json({ ok: false, error: "JSON inválido" }, 400); }

  const action = body?.action;

  try {
    // ---------- ACCION: verificar ----------
    if (action === "verificar") {
      const codigo = String(body?.codigo ?? "").trim();
      if (!codigo) return json({ ok: false, error: "Escribe tu código" });

      const ip = getIP(req);

      // 1) anti fuerza-bruta
      const { data: chk, error: chkErr } = await supabase.rpc("chequear_intento", {
        p_ip: ip, p_max: INTENTOS_MAX, p_min: INTENTOS_MIN,
      });
      if (chkErr) throw chkErr;
      const est = Array.isArray(chk) ? chk[0] : chk;
      if (est?.bloqueado) {
        return json({ ok: false, bloqueado: true, minutos_restantes: est.minutos_restantes ?? INTENTOS_MIN });
      }

      // 2) verificar codigo
      const { data: ver, error: verErr } = await supabase.rpc("verificar_codigo", { p_codigo: codigo });
      if (verErr) throw verErr;
      const fila = Array.isArray(ver) ? ver[0] : ver;
      if (fila?.ok) {
        return json({ ok: true, nombre: fila.nombre ?? null, offline: !!fila.offline });
      }

      // 3) fallo -> cuenta el intento
      await supabase.rpc("registrar_fallo", { p_ip: ip, p_min: INTENTOS_MIN });
      return json({ ok: false, error: "Código inválido" });
    }

    // ---------- ACCION: perfil_get (traer perfil+favoritos por codigo) ----------
    if (action === "perfil_get") {
      const codigo = String(body?.codigo ?? "").trim();
      if (!codigo) return json({ ok: false, error: "Falta código" });
      // el codigo debe estar activo
      const { data: ver } = await supabase.rpc("verificar_codigo", { p_codigo: codigo });
      const fila = Array.isArray(ver) ? ver[0] : ver;
      if (!fila?.ok) return json({ ok: false, error: "Código inválido" });
      const { data, error } = await supabase.rpc("perfil_get", { p_codigo: codigo });
      if (error) throw error;
      return json({ ok: true, datos: data ?? null });
    }

    // ---------- ACCION: perfil_set (guardar perfil+favoritos por codigo) ----------
    if (action === "perfil_set") {
      const codigo = String(body?.codigo ?? "").trim();
      const datos = body?.datos ?? {};
      if (!codigo) return json({ ok: false, error: "Falta código" });
      const { data: ver } = await supabase.rpc("verificar_codigo", { p_codigo: codigo });
      const fila = Array.isArray(ver) ? ver[0] : ver;
      if (!fila?.ok) return json({ ok: false, error: "Código inválido" });
      if (JSON.stringify(datos).length > 60000) return json({ ok: false, error: "Datos demasiado grandes" });
      const { error } = await supabase.rpc("perfil_set", { p_codigo: codigo, p_datos: datos });
      if (error) throw error;
      return json({ ok: true });
    }

    // ---------- ACCION: sugerencia ----------
    if (action === "sugerencia") {
      const tipo    = String(body?.tipo ?? "sugerencia").trim().toLowerCase();
      const mensaje = String(body?.mensaje ?? "").trim();
      const codigo  = String(body?.codigo ?? "").trim();
      const version = String(body?.version_app ?? "").trim();

      if (mensaje.length < 4 || mensaje.length > 2000) {
        return json({ ok: false, error: "El mensaje debe tener entre 4 y 2000 caracteres." });
      }

      // guardar en la tabla
      const { error: insErr } = await supabase.rpc("enviar_sugerencia", {
        p_tipo: tipo, p_mensaje: mensaje, p_codigo: codigo || null, p_version: version || null,
      });
      if (insErr) throw insErr;

      // enviar correo (si falla, NO rompemos: la sugerencia ya quedo guardada)
      if (RESEND_KEY) {
        try { await enviarCorreo(tipo, mensaje, codigo, version); }
        catch (e) { console.error("Resend error:", e); }
      }

      return json({ ok: true });
    }

    return json({ ok: false, error: "Acción no reconocida" }, 400);
  } catch (e) {
    console.error("API error:", e);
    return json({ ok: false, error: "Error interno, intenta más tarde." }, 500);
  }
});
