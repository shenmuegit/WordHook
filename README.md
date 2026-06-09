# WordHook

> Read English on the web — select any word or sentence, get an LLM-grade explanation you can actually understand, hear it, save it to Anki.

A Chrome extension for English learners reading technical / news content in the wild.

Pick anything on a page → see structured analysis (IPA, POS, plain-language meaning, bilingual examples; or for sentences: natural translation, literal word-by-word gloss, structural breakdown, key grammar points). Hear it via system TTS. Save it as an Anki card. Export when you're ready.

Designed for **absolute beginners**: no jargon. Parts of speech are written in Chinese ("动词" not "v."), every English example comes with a Chinese translation, sentence breakdowns explain "what's being said and where it turns" instead of "subject-verb-object".

Currently ships with Hacker News support out of the box — extending to other sites is a one-line manifest change.

## Features

- **Select-to-analyze** — highlight any text on a supported page, get a popup with structured analysis
- **Word vs sentence mode** — auto-detected by length/punctuation, manually overridable with a button
- **Streaming render** — partial JSON extracted from the LLM stream renders progressively; translation appears in ~1s, full analysis in ~5–8s
- **Local TTS** — system speech synthesis, free and offline
- **Anki export** — save cards locally, export as a `.txt` with proper header directives, import into Anki in one click
- **Caching** — same selection isn't re-queried; cost-controlled by design

## Install (developer mode for now)

1. Clone this repo
2. Open `chrome://extensions/`, toggle "Developer mode" on
3. Click "Load unpacked", select the cloned folder
4. Click the WordHook icon, fill in three fields:
   - **Base URL** — any OpenAI-compatible endpoint (e.g. `https://api.deepseek.com/v1`)
   - **Model** — model name (e.g. `deepseek-v4-flash`, `gpt-4o-mini`)
   - **API Key** — your own key

   The popup will prompt for host permission to that domain. Approve it.

5. Go to https://news.ycombinator.com/ and select any English text.

## Supported LLM providers

Anything that speaks OpenAI Chat Completions protocol, including:

- DeepSeek (`https://api.deepseek.com/v1`, `deepseek-v4-flash`) — recommended, cheap
- OpenAI (`https://api.openai.com/v1`, `gpt-4o-mini`)
- Moonshot / Kimi (`https://api.moonshot.cn/v1`, `moonshot-v1-8k`)
- SiliconFlow, Together, Groq, or any OpenAI-compatible relay

## Anki: enabling auto-TTS (one-time)

After importing the `.txt`, edit the Basic notetype card template once:

1. Anki → Tools → Manage Note Types
2. Select "Basic" (or "问答题" in Chinese Anki) → Cards
3. In the Front Template, add a new line after `{{Front}}`:

   ```
   {{tts en_US:Front}}
   ```

   In Chinese Anki use `{{tts en_US:正面}}` instead.

4. Save. All future imports will auto-read the English front.

## Privacy

- API key is stored only in `chrome.storage.local` on your machine. Nothing is uploaded anywhere by this extension.
- Selected text is sent **directly to the LLM endpoint you configured** — no intermediate server.
- Cards are stored locally until you export and clear.

## Tech stack

- Manifest V3, no build step, no dependencies
- Service worker (background) does LLM calls, caching, card storage
- Content script (Shadow DOM popup) does selection detection, streaming render
- Popup is plain HTML for config + Anki management

## Project status

v0. Built for personal use first; published in case others find it useful. See `实施方案.txt` for the original design notes and phasing.

What's intentionally NOT in v0:
- Cloud TTS (uses Web Speech API)
- AnkiConnect direct push (manual `.txt` export only)
- `.apkg` packaging with embedded audio
- Sites other than Hacker News
- Account / sync / cross-device

## License

MIT (add LICENSE file as needed).
