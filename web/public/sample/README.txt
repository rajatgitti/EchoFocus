Demo audio for the "Try an example" button.

Generated with this repository's own mixture synthesiser (vanta/data/synthesize.py)
from LibriSpeech dev-clean, which is licensed CC BY 4.0:

  Panayotov et al., "Librispeech: an ASR corpus based on public domain audio
  books", ICASSP 2015. https://openslr.org/12

  reference.wav  5s, the target speaker alone
  mixture.wav    8s, the same speaker plus a second speaker, room reverberation
                 and background noise, at ~4.8 dB interference SNR

Both speakers are held out — neither model saw them during training. On this
pair the deployed model improves SI-SDR by +10.2 dB (+3.0 -> +13.2).

ami/  Real meeting recordings from the AMI Meeting Corpus (CC BY 4.0),
      https://groups.inf.ed.ac.uk/ami/corpus/ - meetings ES2002a and IS1009a.
      <case>_mixture.wav    10 s from the far-field room microphone, target
                            speaker overlapping with others
      <case>_reference.wav  5 s of the target alone, same room microphone,
                            from a different part of the meeting
      Results on these are far weaker than on synthetic mixtures (about +1 dB
      on average); IS1009a_D is a known failure case (similar voices).
