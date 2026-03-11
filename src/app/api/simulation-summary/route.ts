import Anthropic from '@anthropic-ai/sdk';
import { SimulationResult } from '@/lib/simulation/types';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are PharmaView's Simulation Analyst. You analyze pharmaceutical supply chain disruption simulation results and produce executive summaries with procurement recommendations.

IMPORTANT: All results you are analyzing are SIMULATED PROJECTIONS, not real events. Always make this clear in your response.

Format your response as a concise executive briefing:
1. **Scenario Overview** — 2-3 sentence summary of the simulated event
2. **Impact Assessment** — Key drugs at risk, affected regions, severity
3. **Shortage Probability** — Highlight the confidence intervals and projected timelines
4. **Recommended Actions** — 3-5 specific, actionable procurement steps
5. **Risk Mitigation** — Long-term supply chain resilience recommendations

Use specific drug names, manufacturer names, and country data from the simulation results. Be data-driven and precise. Keep the total response under 500 words.`;

function buildPrompt(result: SimulationResult): string {
  const topDrugs = result.affectedDrugs
    .sort((a, b) => b.shortageProbability - a.shortageProbability)
    .slice(0, 10);

  const drugSummary = topDrugs.map((d) =>
    `- ${d.name} (${d.category}): ${(d.shortageProbability * 100).toFixed(0)}% shortage probability ` +
    `[${(d.confidenceInterval[0] * 100).toFixed(0)}–${(d.confidenceInterval[1] * 100).toFixed(0)}% CI], ` +
    `recovery: ${d.recoveryRange[0]}–${d.recoveryRange[1]} days, impact: ${d.impactLevel}`
  ).join('\n');

  const regionSummary = result.affectedRegions.map((r) =>
    `- ${r.countryName}: ${r.affectedFacilities}/${r.totalFacilities} facilities affected (${r.percentAffected}%), ${r.drugsAtRisk} drugs at risk`
  ).join('\n');

  return `Analyze this SIMULATED supply chain disruption:

Simulation Type: ${result.params.type}
Parameters: ${JSON.stringify(result.params, null, 2)}
Overall Severity: ${result.overallSeverity}
Total Drugs Affected: ${result.totalDrugsAffected}
Total Facilities Affected: ${result.totalFacilitiesAffected}
Estimated Recovery: ${result.estimatedRecoveryTimeline}

Top Affected Drugs:
${drugSummary}

Affected Regions:
${regionSummary || 'N/A'}

Existing Recommendations:
${result.recommendations.map((r) => `- ${r}`).join('\n')}

Please produce an executive simulation briefing with procurement recommendations.`;
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === 'your_key_here') {
      return Response.json(
        { error: 'ANTHROPIC_API_KEY not configured', summary: null },
        { status: 503 },
      );
    }

    const { result } = (await request.json()) as { result: SimulationResult };
    if (!result || !result.params) {
      return Response.json({ error: 'Invalid simulation result' }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(result) }],
    });

    const summary = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.type === 'text' ? block.text : '')
      .join('');

    return Response.json({ summary });
  } catch (err) {
    console.error('Simulation summary error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to generate summary' },
      { status: 500 },
    );
  }
}
