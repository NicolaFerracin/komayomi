from __future__ import annotations

import re


PATTERNS = [
    (re.compile(r"(?:昔々|むかしむかし)のこと"), "昔々のこと", "Story-opening expression", "A conventional story opening meaning “once upon a time” or “it was long, long ago.” Here こと frames むかしむかし as the time or event being spoken about.", "once upon a time", .99),
    (re.compile(r"ことにな(?:る|った|ります|りました)"), "ことになる", "Result or arrangement", "Marks that something has been decided, arranged, or has come to be the case—often without emphasizing the speaker’s own decision.", "it has been decided that… / it turns out that…", .96),
    (re.compile(r"ことに(?:する|した|します|しました)"), "ことにする", "Deliberate decision", "Marks a decision made by the subject: choosing or deciding to do something.", "decide to…", .96),
    (re.compile(r"ことが(?:ある|あります|あった|ありました)"), "ことがある", "Experience or occasional occurrence", "After a past-form verb it describes an experience; after a non-past verb it can mean something happens occasionally.", "have experienced… / sometimes…", .93),
    (re.compile(r"ことが(?:できる|できます|できた|できました)"), "ことができる", "Ability", "Turns the preceding verb phrase into an ability or possibility.", "can… / be able to…", .98),
    (re.compile(r"ということ"), "ということ", "Meaning or conclusion", "Packages the preceding statement as a fact, meaning, or conclusion: ‘the fact that…’ or ‘that means…’.", "the fact that… / that means…", .94),
    (re.compile(r"([ぁ-んァ-ヶ一-龯々]+)のこと"), "X のこと", "The matter or person concerning X", "こと packages X as the person, matter, event, or situation being discussed. Its natural English rendering depends strongly on X and the surrounding sentence.", "about X / the matter of X", .72),
]


def analyze(sentence: str, focus: str | None = None) -> dict:
    sentence = sentence.strip()
    matches = []
    occupied: list[tuple[int, int]] = []
    for pattern, form, title, explanation, hint, confidence in PATTERNS:
        for found in pattern.finditer(sentence):
            start, end = found.span()
            if any(start >= left and end <= right for left, right in occupied):
                continue
            if focus and focus not in found.group(0) and found.group(0) not in focus:
                continue
            matches.append({"span": found.group(0), "form": form, "title": title, "explanation": explanation,
                            "translation_hint": hint, "confidence": confidence, "start": start, "end": end,
                            "source": "local rule"})
            occupied.append((start, end))
    return {"sentence": sentence, "focus": focus, "matches": matches, "needs_context": not matches or max((m["confidence"] for m in matches), default=0) < .85}
