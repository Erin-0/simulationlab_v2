/* =====================================================================
   functions/api/tts.js  —  Moteur TTS V2 ElevenLabs (Cloudflare Function)
   - Modèle : eleven_flash_v2_5 (Latence ultra-faible ~75ms)
   - Langue : Français (Voix masculine naturelle)
   - Gestion d'erreur & Protection contre l'épuisement de quota
   ===================================================================== */

export async function onRequestPost(context) {
    const { request, env } = context;

    // 1. Clé secrète ElevenLabs stockée dans l'environnement Cloudflare
    const ELEVENLABS_API_KEY = env.ELEVENLABS_API_KEY;

    // Voix masculine par défaut : "Daniel" (éloquente, claire) ou personnalisée
    const VOICE_ID = env.ELEVENLABS_VOICE_ID || "onwK4e9ZLuTAKqWW03F9";

    if (!ELEVENLABS_API_KEY) {
        return new Response(JSON.stringify({ 
            ok: false, 
            fallback: true,
            error: "Clé ELEVENLABS_API_KEY non configurée. Bascule sur la voix locale." 
        }), {
            status: 503,
            headers: { "Content-Type": "application/json" }
        });
    }

    try {
        const body = await request.json().catch(() => ({}));
        let text = String(body.text || "").trim();

        if (!text) {
            return new Response("Texte manquant", { status: 400 });
        }

        // 2. Gestion de la longueur : troncature pour préserver les crédits du plan gratuit
        // (Limite à 280 caractères, coupée à la dernière ponctuation)
        if (text.length > 280) {
            const cut = text.slice(0, 280);
            const lastPunct = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
            text = (lastPunct > 100) ? cut.slice(0, lastPunct + 1) : cut.slice(0, cut.lastIndexOf(' ')) + '...';
        }

        // 3. Appel de l'API ElevenLabs avec le modèle ultra-rapide Flash v2.5
        const elevenUrl = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`;

        const elevenRes = await fetch(elevenUrl, {
            method: "POST",
            headers: {
                "xi-api-key": ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg"
            },
            body: JSON.stringify({
                text: text,
                model_id: "eleven_flash_v2_5", // Le modèle le plus rapide en français
                voice_settings: {
                    stability: 0.55,
                    similarity_boost: 0.80,
                    speed: 1.02
                }
            })
        });

        // 4. Gestion d'erreurs (Quota épuisé 400/429, clé invalide 401, etc.)
        if (!elevenRes.ok) {
            const errJson = await elevenRes.json().catch(() => ({}));
            console.warn("[ElevenLabs TTS] Erreur API :", elevenRes.status, errJson);
            
            return new Response(JSON.stringify({ 
                ok: false, 
                fallback: true, 
                status: elevenRes.status,
                detail: errJson.detail || "Erreur de quota ou de clé"
            }), {
                status: elevenRes.status,
                headers: { "Content-Type": "application/json" }
            });
        }

        // 5. Renvoyer le flux audio MP3 directement au client
        const audioBuffer = await elevenRes.arrayBuffer();

        return new Response(audioBuffer, {
            status: 200,
            headers: {
                "Content-Type": "audio/mpeg",
                "Cache-Control": "public, max-age=1800" // Mise en cache pour économiser les crédits
            }
        });

    } catch (err) {
        return new Response(JSON.stringify({ 
            ok: false, 
            fallback: true, 
            error: err.message 
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}