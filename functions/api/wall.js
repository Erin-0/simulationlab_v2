// functions/api/wall.js
export async function onRequest(context) {
    const { request, env } = context;
    const method = request.method;

    // Récupération des clés secrètes depuis l'environnement Cloudflare
    const SB_URL = env.SUPABASE_URL;
    const SB_KEY = env.SUPABASE_ANON || env.SUPABASE_SERVICE_ROLE;

    if (!SB_URL || !SB_KEY) {
        return new Response(JSON.stringify({ error: "Configuration Supabase manquante sur le serveur." }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    const headers = {
        "apikey": SB_KEY,
        "Authorization": `Bearer ${SB_KEY}`,
        "Content-Type": "application/json"
    };

    // --- 1. REQUÊTE GET : Récupérer les nouveaux traits ---
    if (method === "GET") {
        const url = new URL(request.url);
        const cursor = url.searchParams.get("after") || "0";
        const limit = url.searchParams.get("limit") || "1000";

        const targetUrl = `${SB_URL}/rest/v1/wall_strokes?select=id,player_id,color,size,points&wall=eq.main&id=gt.${cursor}&order=id.asc&limit=${limit}`;

        try {
            const sbRes = await fetch(targetUrl, { headers });
            const data = await sbRes.json();
            return new Response(JSON.stringify(data), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500 });
        }
    }

    // --- 2. REQUÊTE POST : Enregistrer de nouveaux traits ---
    if (method === "POST") {
        try {
            const strokes = await request.json();
            if (!Array.isArray(strokes) || strokes.length === 0) {
                return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
            }

            // Validation de sécurité : limite à 50 traits par envoi
            const cleanStrokes = strokes.slice(0, 50).map(s => ({
                wall: "main",
                player_id: String(s.player_id || "anon").slice(0, 36),
                player_name: String(s.player_name || "Anonyme").slice(0, 24),
                color: String(s.color || "#ffffff").slice(0, 10),
                size: Math.max(1, Math.min(30, Number(s.size) || 8)),
                points: Array.isArray(s.points) ? s.points.slice(0, 3000) : []
            }));

            const targetUrl = `${SB_URL}/rest/v1/wall_strokes`;
            const sbRes = await fetch(targetUrl, {
                method: "POST",
                headers: { ...headers, "Prefer": "return=minimal" },
                body: JSON.stringify(cleanStrokes)
            });

            if (!sbRes.ok) {
                const errText = await sbRes.text();
                return new Response(JSON.stringify({ error: errText }), { status: sbRes.status });
            }

            return new Response(JSON.stringify({ ok: true }), {
                headers: { "Content-Type": "application/json" }
            });
        } catch (err) {
            return new Response(JSON.stringify({ error: err.message }), { status: 500 });
        }
    }

    return new Response("Méthode non autorisée", { status: 405 });
}