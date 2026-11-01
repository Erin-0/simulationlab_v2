export async function onRequestPost(context) {
    const { request, env } = context;

    // Récupération de la clé secrète stockée dans Cloudflare (invisible côté client)
    const GROQ_API_KEY = env.GROQ_API_KEY;

    if (!GROQ_API_KEY) {
        return new Response(JSON.stringify({ 
            ok: false, 
            e: "Clé API non configurée sur le serveur Cloudflare." 
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const body = await request.json();
        const userMessage = body.message || "";
        const history = body.history || [];

        // Appel direct et sécurisé à l'API Groq depuis le serveur Cloudflare
        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    {
                        role: "system",
                        content: "Tu es Ohmie, le sympathique robot tuteur d'un laboratoire de physique 3D. Réponds en français de façon pédagogique, concise et encourageante."
                    },
                    ...history,
                    { role: "user", content: userMessage }
                ],
                max_tokens: 300,
                temperature: 0.6
            })
        });

        if (groqResponse.status === 429) {
            return new Response(JSON.stringify({ ok: false, e: "rate_limit" }), { status: 429 });
        }

        const data = await groqResponse.json();
        const reply = data.choices?.[0]?.message?.content || "Je n'ai pas pu formuler de réponse.";

        return new Response(JSON.stringify({ ok: true, reply }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        return new Response(JSON.stringify({ ok: false, e: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}