# Third-Party Notices & Attribution

EchoFocus incorporates and builds upon open-source software. This document records third-party components, their licenses, and required attribution notices.

---

## 1. VANTA (Voice-Aware Neural Target Acoustic Extraction)

- **Source**: [https://github.com/Komalpreet2809/Vanta](https://github.com/Komalpreet2809/Vanta)
- **Author**: Komalpreet Kaur
- **License**: MIT License

### Description
EchoFocus preserves and uses the original target speaker extraction architecture, separator, speaker conditioning mechanism, audio preprocessing, and trained checkpoints from the VANTA project:
- Conv-TasNet dilated depthwise separator (`checkpoints/fully_ours/best.pt`)
- ECAPA-TDNN speaker encoder (`checkpoints/spk_encoder/best.pt`)
- Time-domain waveform encoder and decoder
- Least-squares phase and gain reconstruction

### License Text:
```
MIT License

Copyright (c) 2026 Komalpreet Kaur (https://github.com/Komalpreet2809/Vanta)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 2. OpenAI Whisper

- **Source**: [https://github.com/openai/whisper](https://github.com/openai/whisper)
- **License**: MIT License
- **Copyright**: (c) OpenAI

Used for multilingual speech recognition, language detection, and token-level acoustic probabilities.

---

## 3. WaveSurfer.js

- **Source**: [https://github.com/katspaugh/wavesurfer.js](https://github.com/katspaugh/wavesurfer.js)
- **License**: BSD-3-Clause
- **Copyright**: (c) katspaugh and contributors

Used for interactive waveform rendering and audio playback.

---

## 4. Next.js & React

- **License**: MIT License
- **Copyright**: (c) Vercel, Inc. and Meta Platforms, Inc.
