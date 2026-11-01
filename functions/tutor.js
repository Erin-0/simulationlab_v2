export async function onRequestPost(context) {
    const { request, env } = context;
    const GROQ_API_KEY = env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
        return new Response(JSON.stringify({
            ok: false, e: "Clé API non configurée sur le serveur Cloudflare."
        }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    try {
        const body = await request.json().catch(() => ({}));

        // ---- validation entrée ----
        const userMessage = typeof body.message === "string" ? body.message.trim() : "";
        if (userMessage.length < 2) {
            return new Response(JSON.stringify({
                ok: false, e: "Question trop courte : deux caractères minimum."
            }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        if (userMessage.length > 600) {
            return new Response(JSON.stringify({
                ok: false, e: "Question trop longue : 600 caractères maximum."
            }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        const safeHistory = Array.isArray(body.history)
            ? body.history
                .filter(m => m && (m.role === "user" || m.role === "assistant")
                             && typeof m.content === "string")
                .slice(-6)
            : [];

        // ---- appel Groq ----
        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json",
                // Cloudflare devant api.groq.com rejette les UA vides / non navigateur (erreur 1010)
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                              "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system",
                      content: "Tu es Ohmie, le sympathique robot tuteur d'un laboratoire de physique 3D. Réponds en français de façon pédagogique, concise et encourageante." },
                    ...safeHistory,
                    { role: "user", content: userMessage }
                ],
                max_tokens: 500,
                temperature: 0.6
            })
        });

        // ---- gestion explicite des erreurs HTTP ----
        if (groqResponse.status === 429) {
            return new Response(JSON.stringify({ ok: false, e: "rate_limit" }), {
                status: 429, headers: { "Content-Type": "application/json" }
            });
        }
        if (!groqResponse.ok) {
            const errBody = await groqResponse.text();
            console.warn("[Groq tutor] HTTP", groqResponse.status, errBody.slice(0, 400));
            return new Response(JSON.stringify({
                ok: false,
                e: `Erreur API Groq (${groqResponse.status}) — vérifiez GROQ_API_KEY et le modèle.`
            }), { status: 502, headers: { "Content-Type": "application/json" } });
        }

        const data = await groqResponse.json();
        const choice = data.choices?.[0];
        const content = choice?.message?.content?.trim();

        if (!content) {
            console.warn("[Groq tutor] content vide — finish_reason:", choice?.finish_reason);
        }

        const reply = content || "Je n'ai pas pu formuler de réponse.";

        return new Response(JSON.stringify({ ok: true, reply }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        console.warn("[Groq tutor] exception:", err && err.message);
        return new Response(JSON.stringify({
            ok: false, e: err.message || "Erreur interne."
        }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
}
