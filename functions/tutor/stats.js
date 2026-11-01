/* GET /tutor/stats — informations sur le quota du tuteur */

const GROQ_MODEL = "openai/gpt-oss-120b";
const TUTOR_RPM = 30,  TUTOR_TPM = 8000;
const TUTOR_RPD = 1000, TUTOR_TPD = 200000;

export async function onRequestGet(context) {
    const { env } = context;
    const key = (env.GROQ_API_KEY || "").trim();
    return new Response(JSON.stringify({
        ok: true,
        configured: !!key,
        model: GROQ_MODEL,
        day_tokens: 0,
        day_requests: 0,
        min_requests: 0,
        min_tokens: 0,
        pct_tokens: 0,
        pct_requests: 0,
        limits: { rpm: TUTOR_RPM, tpm: TUTOR_TPM, rpd: TUTOR_RPD, tpd: TUTOR_TPD },
    }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}
