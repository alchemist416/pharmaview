import Anthropic from '@anthropic-ai/sdk';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are PharmaView Analyst, an AI assistant specializing in pharmaceutical supply chain intelligence. You have deep expertise in:

- FDA drug recalls, enforcement actions, and safety signals
- Drug shortage tracking and root-cause analysis
- Global pharmaceutical manufacturing and supply chain geography
- API (Active Pharmaceutical Ingredient) sourcing and concentration risks
- Regulatory compliance (FDA, EMA, WHO) and cGMP standards

When answering:
- Be concise and data-driven, like a Bloomberg terminal analyst
- Use specific drug names, NDC codes, and manufacturer names when relevant
- Flag supply chain concentration risks (e.g., single-source APIs, geographic clustering)
- Reference FDA classification levels (Class I/II/III) for recalls
- Highlight actionable insights for procurement and risk teams
- Format responses with clear structure using markdown

You may be provided with live FDA data context below. When available, reference this data directly in your analysis.`;

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === 'your_key_here') {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { messages, currentShortages, recentRecalls } = await request.json();

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Build context-enriched system prompt with live data
    let systemPrompt = SYSTEM_PROMPT;

    if (Array.isArray(currentShortages) && currentShortages.length > 0) {
      const shortageList = currentShortages
        .slice(0, 20)
        .map((s: { generic_name?: string; brand_name?: string; status?: string }) =>
          `- ${s.generic_name || s.brand_name || 'Unknown'} (${s.status || 'Unknown'})`
        )
        .join('\n');
      systemPrompt += `\n\n## Current Drug Shortages (live FDA data)\n${shortageList}`;
    }

    if (Array.isArray(recentRecalls) && recentRecalls.length > 0) {
      const recallList = recentRecalls
        .slice(0, 15)
        .map((r: { recalling_firm?: string; classification?: string; reason_for_recall?: string }) =>
          `- ${r.recalling_firm || 'Unknown'} | ${r.classification || 'N/A'} | ${(r.reason_for_recall || '').slice(0, 80)}`
        )
        .join('\n');
      systemPrompt += `\n\n## Recent FDA Recalls (live data)\n${recallList}`;
    }

    const anthropic = new Anthropic({ apiKey });

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              const chunk = `data: ${JSON.stringify({ text: event.delta.text })}\n\n`;
              controller.enqueue(encoder.encode(chunk));
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Stream error';
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: errorMsg })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('Analyst API error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
