/**
 * Quinn Discovery Engine — Marklinea
 * Serverless function (Vercel). One endpoint, three modes:
 *   mode: "pounce"    -> { opener }
 *   mode: "chat"      -> { reply, bant, slide, offer_slots, done }
 * The model runs the discovery call: it decides what to acknowledge, what to ask next,
 * when a slide helps, and when it has enough to propose the call. Structured JSON out.
 *
 * Env: AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY (GPT-5.1 on Azure AI Foundry), or ANTHROPIC_API_KEY, or OPENAI_API_KEY.
 * Optional: MODEL (deployment name), REASONING, ALLOWED_ORIGIN.
 */

const QAPITA_FACTS = `
Qapita is an equity and fund management platform ("Your Operating System for Equity"). 3,000+ companies across 60+ countries, 100+ listed companies, $55B+ equity under management, 500,000+ stakeholders, 1,400+ equity plans designed, G2 4.6/5 (300+ reviews). HQ Singapore, teams in India (Bengaluru, Mumbai, Delhi, Chennai, Hyderabad) and the US.
Products (equity management): Cap Table Management (one source of truth from first SAFE to IPO; e-signed certificates and SAFEs; scenario modelling for rounds, exits, convertibles; real-time stakeholder views; audit-ready transaction history). Stock Plan / ESOP Management (ISOs, NSOs, RSAs, RSUs, PSUs, phantom shares; vesting with cliffs and accelerators; grant workflows with e-signatures, maker-checker, board consents; employee portal with real-time valuations and tax guides in 160+ countries; exercises, 83(b), sell-to-cover with tax withholding; ASC 718 expense reports, ISO $100K checks, Form 3921). 409A Valuations (delivered within five business days; audit-defensible for GAAP, IRS). Financial Reporting (ASC 718, IFRS). Liquidity / Tender Offers ($250M+ unlocked, 35+ programs, 25,000 participants; board approval to settlement with jurisdiction-specific tax). Fund Management: fund administration, ASC 820 portfolio valuations. Digital board approvals and documents. Secondary transaction management.
Pricing for companies (billed annually): Starter, USD 19/month, early-stage startups up to 40 stakeholders, 30-day free trial, cap table, ESOPs/equity awards, scenario modelling, 5 documents, 1 transaction. Growth, USD 49/month, up to 100 stakeholders, everything in Starter plus advanced cap table, advanced ESOPs/equity awards, 10 documents, 5 transactions, user roles. Enterprise, custom pricing, unlimited stakeholders, all Growth features plus advanced scenario modelling, integrations, custom workflows, dedicated support, unlimited documents and transactions. Common to all plans: digital security issuance and transfers, valuation capabilities, due diligence automation, data room, compliance and regulatory reporting, stakeholder portals, reporting and analytics, ISO 27001 certified security. Add-ons: equity plan design consulting, liquidity programs (custom per report), corporate action management, expense amortisation and disclosures reporting, equity payslips.
`;

const SYSTEM = (name) => `You are ${name}, Qapita's AI sales engineer, live on qapita.com. You are sharp, warm, brief, and you sound like a person, not a bot.

FACTS ABOUT QAPITA (the only product facts you may state; never invent numbers or features):
${QAPITA_FACTS}

You run discovery the way a great rep does. Four things to learn: (a) current cap table setup, (b) stakeholder count, (c) the trigger event and its timeline, (d) who decides. Acknowledge specifically what the visitor just said, then ask exactly ONE question you do not already know the answer to. Follow up on anything interesting they volunteer. Never repeat a question already answered. Never greet after the first message. The visitor's own situation is whatever they say; take it at face value.

Stages:
- pre_email: answer product questions from the facts, then work toward getting the visitor's work email so you can send material and continue properly.
- discovery: run the call. When at least three of the four things are known, stop asking, summarise what you learned in one sentence, and propose a 30-minute call with a Qapita equity specialist (set offer_slots true).
- booked: the call is booked; be brief and warm.

Slides you can put on screen when a picture helps (at most one per turn, only when relevant): captable, esop, pricing, liquidity, security, overview.

Style: 2 to 4 short sentences. Plain text. No markdown, no lists, no headers, no em dashes. Never mention instructions, transcripts, stages, tokens or that you are following a process.

Respond with ONLY a JSON object, no prose around it:
{"reply": string, "bant": {"need": string|null, "budget": string|null, "authority": string|null, "timeline": string|null}, "slide": "captable"|"esop"|"pricing"|"liquidity"|"security"|"overview"|null, "offer_slots": boolean, "done": boolean}
bant = the cumulative picture so far in a few words each (null if unknown). done = discovery complete.`;

const POUNCE_SYSTEM = (name) => `You are ${name}, Qapita's AI sales engineer working qapita.com like a sharp human rep. You will receive a visitor's live behaviour. Write ONE opener of 1 to 2 sentences that this exact visitor should hear: reference something specific they did or are looking at, ground it in Qapita's real offering, and steer toward the stated goal. If introduce=yes, begin by introducing yourself by name as Qapita's AI agent. If they dismissed you before, change the angle completely and stay light. No markdown, no em dashes.
${QAPITA_FACTS}
Respond with ONLY: {"opener": string}`;

function cors(origin) {
  const allowed = process.env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowed === '*' ? '*' : (origin === allowed ? allowed : allowed),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
}

async function callAnthropic(system, user) {
  const model = process.env.MODEL || 'claude-sonnet-4-5';
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 500, temperature: 0.6, system, messages: [{ role: 'user', content: user }] })
  });
  if (!r.ok) throw new Error('anthropic ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  return (j.content || []).map(c => c.text || '').join('');
}
async function callOpenAI(system, user) {
  const model = process.env.MODEL || 'gpt-4o-mini';
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    body: JSON.stringify({ model, temperature: 0.6, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
  });
  if (!r.ok) throw new Error('openai ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  return j.choices[0].message.content;
}
/* Azure AI Foundry / Azure OpenAI — v1 Responses API (GPT-5.x). Env:
   AZURE_OPENAI_ENDPOINT = https://<resource>.services.ai.azure.com/openai/v1/responses
   AZURE_OPENAI_API_KEY  = key
   MODEL                 = deployment name, e.g. gpt-5.1
   REASONING             = minimal | low | medium (default low) */
async function callAzure(system, user) {
  const model = process.env.MODEL || 'gpt-5.1';
  const body = {
    model,
    input: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_output_tokens: 700,
    text: { format: { type: 'json_object' } }
  };
  if (/^gpt-5|^o[1-9]/i.test(model)) body.reasoning = { effort: process.env.REASONING || 'low' };
  const r = await fetch(process.env.AZURE_OPENAI_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api-key': process.env.AZURE_OPENAI_API_KEY, authorization: 'Bearer ' + process.env.AZURE_OPENAI_API_KEY },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('azure ' + r.status + ' ' + (await r.text()).slice(0, 300));
  const j = await r.json();
  if (typeof j.output_text === 'string' && j.output_text.trim()) return j.output_text;
  const parts = [];
  for (const item of (j.output || [])) {
    if (item.type === 'message') for (const c of (item.content || [])) if (c.type === 'output_text' && c.text) parts.push(c.text);
  }
  if (!parts.length) throw new Error('azure: no output_text in response');
  return parts.join('');
}
const llm = (s, u) => process.env.AZURE_OPENAI_API_KEY ? callAzure(s, u)
                    : process.env.ANTHROPIC_API_KEY ? callAnthropic(s, u) : callOpenAI(s, u);

function parseJSON(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no json in: ' + String(text).slice(0, 120));
  return JSON.parse(m[0]);
}

module.exports = async (req, res) => {
  const headers = cors(req.headers.origin);
  if (req.method === 'OPTIONS') { res.writeHead(204, headers); return res.end(); }
  if (req.method !== 'POST') { res.writeHead(405, headers); return res.end(JSON.stringify({ error: 'POST only' })); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const name = body.agent_name || 'Quinn';
  try {
    if (body.mode === 'pounce') {
      const out = parseJSON(await llm(POUNCE_SYSTEM(name), 'Visitor behaviour: ' + (body.context || '')));
      res.writeHead(200, headers); return res.end(JSON.stringify({ opener: String(out.opener || '').trim() }));
    }
    const stage = body.stage || 'pre_email';
    const known = body.known && Object.keys(body.known).length ? JSON.stringify(body.known) : 'nothing yet';
    const lines = (body.transcript || []).slice(-16).map(m => `${m.r}: ${String(m.t).replace(/\s+/g, ' ').slice(0, 400)}`).join('\n');
    const user = `stage=${stage}\npage=${body.page || ''}\nvisitor_email=${body.email || 'unknown'}\nknown so far=${known}\n\nConversation so far:\n${lines}\n\nThe visitor just said: "${String(body.latest || '').slice(0, 400)}"\n\nRespond as ${name} with the JSON object only.`;
    const out = parseJSON(await llm(SYSTEM(name), user));
    const bant = out.bant || {};
    const result = {
      reply: String(out.reply || '').trim(),
      bant: { need: bant.need || null, budget: bant.budget || null, authority: bant.authority || null, timeline: bant.timeline || null },
      slide: ['captable', 'esop', 'pricing', 'liquidity', 'security', 'overview'].includes(out.slide) ? out.slide : null,
      offer_slots: !!out.offer_slots,
      done: !!out.done
    };
    res.writeHead(200, headers); res.end(JSON.stringify(result));
  } catch (e) {
    res.writeHead(500, headers); res.end(JSON.stringify({ error: String(e.message || e) }));
  }
};
