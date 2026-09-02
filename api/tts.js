/* Quinn TTS: turns one short line into speech. Provider picked by which key is set in Vercel env.
   DEEPGRAM_API_KEY  -> Deepgram Aura-2   (TTS_VOICE, default aura-2-thalia-en)
   ELEVENLABS_API_KEY-> ElevenLabs        (TTS_VOICE = voice id, default Rachel)
   OPENAI_API_KEY    -> OpenAI tts-1      (TTS_VOICE, default nova)
   AZURE_SPEECH_KEY + AZURE_SPEECH_REGION -> Azure neural (TTS_VOICE, default en-IN-NeerjaNeural)
   No key -> 501, and the page falls back to the browser voice. */

function cors() {
  return {
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

async function deepgram(text) {
  const voice = process.env.TTS_VOICE || 'aura-2-thalia-en';
  const r = await fetch('https://api.deepgram.com/v1/speak?model=' + encodeURIComponent(voice) + '&encoding=mp3', {
    method: 'POST',
    headers: { Authorization: 'Token ' + process.env.DEEPGRAM_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!r.ok) throw new Error('deepgram ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return Buffer.from(await r.arrayBuffer());
}
async function elevenlabs(text) {
  const voice = process.env.TTS_VOICE || '21m00Tcm4TlvDq8ikWAM';
  const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + voice + '?output_format=mp3_44100_128', {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5', voice_settings: { stability: 0.45, similarity_boost: 0.8 } })
  });
  if (!r.ok) throw new Error('elevenlabs ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return Buffer.from(await r.arrayBuffer());
}
async function openai(text) {
  const r = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.TTS_MODEL || 'tts-1', voice: process.env.TTS_VOICE || 'nova', input: text, response_format: 'mp3', speed: 1.05 })
  });
  if (!r.ok) throw new Error('openai tts ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return Buffer.from(await r.arrayBuffer());
}
async function azure(text) {
  const voice = process.env.TTS_VOICE || 'en-IN-NeerjaNeural';
  const ssml = '<speak version="1.0" xml:lang="en-US"><voice name="' + voice + '"><prosody rate="+4%">' +
    text.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) + '</prosody></voice></speak>';
  const r = await fetch('https://' + process.env.AZURE_SPEECH_REGION + '.tts.speech.microsoft.com/cognitiveservices/v1', {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY, 'Content-Type': 'application/ssml+xml',
               'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3' },
    body: ssml
  });
  if (!r.ok) throw new Error('azure speech ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return Buffer.from(await r.arrayBuffer());
}

module.exports = async (req, res) => {
  const h = cors();
  if (req.method === 'OPTIONS') { res.writeHead(204, h); return res.end(); }
  if (req.method !== 'POST') { res.writeHead(405, h); return res.end('POST only'); }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const text = String((body && body.text) || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!text) { res.writeHead(400, { ...h, 'Content-Type': 'application/json' }); return res.end('{"error":"text required"}'); }
  const provider = process.env.DEEPGRAM_API_KEY ? deepgram
                 : process.env.ELEVENLABS_API_KEY ? elevenlabs
                 : process.env.OPENAI_API_KEY ? openai
                 : (process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION) ? azure : null;
  if (!provider) { res.writeHead(501, { ...h, 'Content-Type': 'application/json' }); return res.end('{"error":"no tts provider configured"}'); }
  try {
    const buf = await provider(text);
    res.writeHead(200, { ...h, 'Content-Type': 'audio/mpeg', 'Content-Length': buf.length, 'Cache-Control': 'no-store', 'X-TTS-Provider': provider.name });
    res.end(buf);
  } catch (e) {
    res.writeHead(502, { ...h, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(e.message || e).slice(0, 300) }));
  }
};
