import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const VIDEO_TYPE_STRUCTURES: Record<string, string> = {
  vendas: `Estrutura GCT (Gancho, Conteúdo, CTA):
1. GANCHO (Hook) - Primeiros segundos para capturar atenção. Use: pergunta provocativa, quebra de expectativa, problema comum ou promessa de benefício.
2. CONTEÚDO (Value) - Apresente produto/serviço, benefícios, diferenciais, demonstração rápida. Seja objetivo e focado na solução.
3. CTA (Call to Action) - Direcione para ação: agendar, chamar no WhatsApp, visitar loja. Seja direto e natural, sem parecer venda forçada.`,

  institucional: `Vídeo Institucional - Fortalecer imagem e transmitir credibilidade.
Destaque: História, Estrutura, Equipe, Experiência, Valores.
Mostre o ambiente, apresente colaboradores, demonstre capacidade de atendimento, destaque experiência e autoridade.
Finalize com CTA contextual para conhecer melhor a empresa.`,

  reconhecimento: `Vídeo de Reconhecimento - Apresentar a empresa para quem não conhece.
Responda: Quem somos, O que fazemos, Quais serviços/produtos oferecemos.
Conteúdo amplo e introdutório, ideal para novos seguidores.
Gere clareza sobre posicionamento, serviços disponíveis e valor entregue.
Finalize com CTA para saber mais.`,

  educacional: `Vídeo Educacional - Ensinar algo relevante ao público.
Estrutura: Problema/Dúvida comum → Explicação clara → Dica prática → CTA para tirar dúvidas.
Posicione a empresa como autoridade no assunto.`,

  bastidores: `Vídeo de Bastidores - Mostrar o dia a dia real da empresa.
Mostre: funcionários trabalhando, processos internos, preparação de produtos, atendimento, momentos espontâneos.
Humanize a marca e crie proximidade. O tom deve ser natural e autêntico.
CTA contextual: convite para conhecer de perto.`,

  depoimento: `Vídeo de Depoimento - Prova social com clientes reais.
Conduza com perguntas estratégicas:
- Qual era o problema antes?
- Como foi a experiência?
- O que mudou depois?
- Recomendaria?
Mantenha natural e autêntico. CTA: convide outros a experimentar.`,

  lancamento: `Vídeo de Lançamento - Apresentar novidade com impacto.
Comunicação impactante, destaque para a novidade, explicação clara do diferencial, estímulo à curiosidade.
Crie expectativa e desejo. CTA direto para a ação relacionada ao lançamento.`,
};

const FORMAT_CONTEXT: Record<string, string> = {
  reels: "Formato: Reels (vídeo vertical curto, 30-90 segundos, dinâmico, direto ao ponto)",
  story: "Formato: Story (vídeo vertical 15-60 segundos, casual, conversacional, próximo do público)",
  criativo: "Formato: Criativo/Arte (peça visual estática ou carrossel para feed, foco em copy persuasiva)",
};

interface ExampleScript {
  title: string;
  videoType: string;
  contentFormat: string;
  clientName: string;
  content: string;
}

function buildExamplesBlock(examples: ExampleScript[]): string {
  if (!examples || examples.length === 0) return '';

  const blocks = examples.map((ex, i) => 
    `--- EXEMPLO ${i + 1} ---
Título: ${ex.title}
Tipo: ${ex.videoType} | Formato: ${ex.contentFormat} | Cliente: ${ex.clientName}
Conteúdo:
${ex.content}
--- FIM EXEMPLO ${i + 1} ---`
  ).join('\n\n');

  return `

ROTEIROS DE REFERÊNCIA DA EQUIPE (use como base para entender o estilo, tom, estrutura e formato que a equipe utiliza — adapte ao contexto do novo roteiro):

${blocks}

IMPORTANTE: Analise os exemplos acima para entender:
- A estrutura e formatação que a equipe prefere
- O tom de voz e linguagem utilizados
- Como os ganchos são construídos
- Como os CTAs são formulados
- O nível de detalhe nas descrições de cena
Replique esse padrão no novo roteiro, adaptando ao cliente e tipo de vídeo solicitado.`;
}

// Support Google Gemini, OpenAI, and Anthropic Claude
async function getAiConfig(provider?: string, dbApiKey?: string) {
  const geminiKey = Deno.env.get("GOOGLE_GEMINI_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const claudeKey = Deno.env.get("ANTHROPIC_API_KEY");

  if (provider === "gemini" && (geminiKey || dbApiKey)) return { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: geminiKey || dbApiKey!, provider: "gemini" as const };
  if (provider === "openai" && (openaiKey || dbApiKey)) return { url: "https://api.openai.com/v1/chat/completions", key: openaiKey || dbApiKey!, provider: "openai" as const };
  if (provider === "claude" && (claudeKey || dbApiKey)) return { url: "https://api.anthropic.com/v1/messages", key: claudeKey || dbApiKey!, provider: "claude" as const };

  if (geminiKey) return { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: geminiKey, provider: "gemini" as const };
  if (openaiKey) return { url: "https://api.openai.com/v1/chat/completions", key: openaiKey, provider: "openai" as const };
  if (claudeKey) return { url: "https://api.anthropic.com/v1/messages", key: claudeKey, provider: "claude" as const };

  throw new Error("Nenhuma API key de IA configurada. Configure via painel de APIs ou variáveis de ambiente.");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { editorial, videoType, contentFormat, clientName, niche, exampleScripts, aiModel, aiProvider } = await req.json();

    // Fetch API key from DB if env vars not set
    let dbApiKey: string | undefined;
    if (aiProvider) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      const providerMap: Record<string, string> = { gemini: 'ai_gemini', openai: 'ai_openai', claude: 'ai_claude' };
      const { data: aiIntegration } = await supabase
        .from("api_integrations")
        .select("config")
        .eq("provider", providerMap[aiProvider] || '')
        .eq("status", "ativo")
        .limit(1)
        .single();
      if (aiIntegration?.config) {
        dbApiKey = (aiIntegration.config as any).api_key_encrypted;
      }
    }

    const ai = await getAiConfig(aiProvider, dbApiKey);
    const selectedModel = aiModel || "gemini-2.5-flash-lite";

    const structure = VIDEO_TYPE_STRUCTURES[videoType] || VIDEO_TYPE_STRUCTURES.vendas;
    const format = FORMAT_CONTEXT[contentFormat] || FORMAT_CONTEXT.reels;
    const examplesBlock = buildExamplesBlock(exampleScripts || []);

    const systemPrompt = `Você é um redator profissional de conteúdo para redes sociais de uma agência de marketing digital brasileira chamada Pulse.

Regras fundamentais:
- Todo conteúdo deve ter CTA conectado ao contexto do vídeo
- O vídeo deve vender sem parecer venda direta
- Use abordagens como convite, sugestão, oportunidade
- Siga a lógica: Conectar → Gerar valor → Convidar para ação
- Escreva em português brasileiro, natural e conversacional
- Use emojis com moderação
- Indique entre aspas ("") as falas que devem ser ditas no vídeo
- Use colchetes [descrição] para indicar cenas/ações visuais
- IMPORTANTE: Se roteiros de referência forem fornecidos, analise-os cuidadosamente e replique o estilo, formato, tom e estrutura da equipe. A equipe quer consistência nos roteiros.

IMPORTANTE: Você DEVE responder usando tool calling com a função "generate_script_with_caption". NÃO responda em texto livre.`;

    const userPrompt = `Crie um roteiro completo para o seguinte cliente:

CLIENTE: ${clientName}
${niche ? `NICHO: ${niche}` : ''}
${editorial ? `LINHA EDITORIAL DO CLIENTE:\n${editorial}\n` : ''}
TIPO DE VÍDEO: ${videoType}
${format}

ESTRUTURA A SEGUIR:
${structure}
${examplesBlock}

Gere o roteiro completo seguindo a estrutura indicada. Seja criativo mas fiel ao posicionamento do cliente. O roteiro deve estar pronto para ser usado pela equipe de gravação.

Além do roteiro, gere uma LEGENDA para postagem no Instagram. A legenda deve:
- Ter no máximo 200 caracteres
- Ser coerente com o conteúdo do vídeo
- Incluir uma CTA curta e direta
- Usar emojis de forma estratégica (1-3 emojis)
- Ser envolvente e gerar curiosidade
- NÃO incluir hashtags (serão adicionadas depois)`;

    let scriptContent = "";
    let captionContent = "";

    if (ai.provider === "claude") {
      // Claude uses a different API format - no tool calling, parse from text
      const res = await fetch(ai.url, {
        method: "POST",
        headers: {
          "x-api-key": ai.key,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          max_tokens: 2500,
          system: systemPrompt.replace("IMPORTANTE: Você DEVE responder usando tool calling com a função \"generate_script_with_caption\". NÃO responda em texto livre.", "Responda com o roteiro completo primeiro, depois em uma linha separada escreva \"LEGENDA:\" seguido da legenda para Instagram."),
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (!res.ok) { const e = await res.text(); throw new Error(`Claude error [${res.status}]: ${e}`); }
      const data = await res.json();
      const fullText = data.content?.[0]?.text || "";
      const legendaIdx = fullText.lastIndexOf("LEGENDA:");
      if (legendaIdx > -1) {
        scriptContent = fullText.slice(0, legendaIdx).trim();
        captionContent = fullText.slice(legendaIdx + 8).trim();
      } else {
        scriptContent = fullText;
      }
    } else {
      // OpenAI-compatible (Gemini, OpenAI) - try tool calling first, fallback to text
      const useToolCalling = ai.provider === "openai"; // Gemini OpenAI-compat may not support tools well

      const requestBody: any = {
        model: selectedModel,
        messages: [
          { role: "system", content: useToolCalling ? systemPrompt : systemPrompt.replace("IMPORTANTE: Você DEVE responder usando tool calling com a função \"generate_script_with_caption\". NÃO responda em texto livre.", "Responda com o roteiro completo primeiro, depois em uma linha separada escreva \"LEGENDA:\" seguido da legenda para Instagram.") },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 4000,
        temperature: 0.8,
      };

      if (useToolCalling) {
        requestBody.tools = [
          {
            type: "function",
            function: {
              name: "generate_script_with_caption",
              description: "Returns the generated script content and a short Instagram caption",
              parameters: {
                type: "object",
                properties: {
                  content: { type: "string", description: "The full script content for the video" },
                  caption: { type: "string", description: "Short Instagram caption (max 200 chars) with CTA and emojis" }
                },
                required: ["content", "caption"],
                additionalProperties: false
              }
            }
          }
        ];
        requestBody.tool_choice = { type: "function", function: { name: "generate_script_with_caption" } };
      }

      const response = await fetch(ai.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${ai.key}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("AI API error:", response.status, errText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em alguns segundos." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Créditos de IA insuficientes." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: `AI error [${response.status}]: ${errText}` }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      console.log("AI response structure:", JSON.stringify(data).slice(0, 500));

      // Try tool calling response first
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          scriptContent = args.content || "";
          captionContent = args.caption || "";
        } catch (e) {
          console.error("Failed to parse tool call arguments:", e);
        }
      }

      // Fallback: extract from text content
      if (!scriptContent) {
        const fullText = data.choices?.[0]?.message?.content || "";
        const legendaIdx = fullText.lastIndexOf("LEGENDA:");
        if (legendaIdx > -1) {
          scriptContent = fullText.slice(0, legendaIdx).trim();
          captionContent = fullText.slice(legendaIdx + 8).trim();
        } else {
          scriptContent = fullText;
        }
      }
    }

    return new Response(JSON.stringify({ content: scriptContent, caption: captionContent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
