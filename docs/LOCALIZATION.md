# Localization

The interface and script language are independent. Choosing English speech on
a German system leaves the interface German and transcribes English.

Included interface translations: English, German, French and Spanish. This is
localization with shipped resources, not automatic translation of arbitrary UI
strings. Unsupported interface languages use English. Scripts are preserved.
Samples are included in these four languages; other selected speech languages
receive the English sample. Paste a sample in the selected language instead.

Recognition support is provider-dependent; it is not implied by UI translation.
OpenAI receives a selected input-language hint using the [official Realtime
transcription language format](https://developers.openai.com/api/docs/guides/realtime-transcription).
Unsupported API languages can be rejected by the provider. Real microphone
accuracy and latency have not been measured for every language.

## MCP/browser platform behavior

The official MCP Apps host context supplies `locale`; browser `navigator.languages`
is the fallback. `Intl` provides locale negotiation, localized language names,
number formatting, sentence segmentation and word segmentation. A host-language
change updates the interface. A system speech-language change pauses capture and
rebuilds the script instead of changing a running microphone session.

Use the Speech language menu, or **Other language code** for a BCP 47 tag.
Browser speech receives the full regional locale. OpenAI receives the language
code, preserving the documented `zh-cn`, `zh-tw` and `zh-hk` forms. The assistant
can supply the optional `language` parameter to `open_teleprompter`.

JavaScript `Intl` does not include spell-out number formatting. Numeral matching
is implemented for English, German, French and Spanish. Other scripts can use
literal numerals; matching a numeral against its fully spelled-out transcription
is not guaranteed outside those four languages. Spoken word joins are bounded
to eight tokens. The meter and keyboard shortcuts do not depend on language.

## Add a translation

Copy `src/locales/en.json` to a new locale JSON file, translate the values and
register it in `src/i18n.ts`. Preserve all keys and placeholders. Language names
come from `Intl.DisplayNames`. The four included UI catalogues are left to right;
a new right-to-left UI translation must also update the document direction rule.
Script direction is already independent of the interface direction.

`bun run check` verifies locale fallback, all catalogue keys/placeholders, regional
speech hints, tracking, Unicode offsets and meaningful non-Latin combining marks.
For local visual checks, the preview accepts `?locale=en-US`, `?locale=fr-FR`, etc.
This development override does not change the OS language or a real host locale.
