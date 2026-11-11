Real-meeting test cases cut from the AMI Meeting Corpus (CC BY 4.0).
https://groups.inf.ed.ac.uk/ami/corpus/  - meetings ES2002a and IS1009a.

Per case (<meeting>_<speaker>):
  _mixture.wav              10 s from the far-field room microphone (Array1-01), target overlaps others
  _reference.wav            5 s of the target alone from their own headset (different part of the meeting)
  _reference_roommic.wav    same 5 s, but from the room microphone (matches the mixture's mic)
  _target_headset.wav       target's headset for the same 10 s (approximate ground truth, has crosstalk)
  _transcript.txt           human transcript: target's words and other speakers' words
  _echofocus_headsetref.wav EchoFocus output using _reference.wav
  _echofocus_roomref.wav    EchoFocus output using _reference_roommic.wav

To try one in the app: upload _mixture.wav as the mixture and _reference_roommic.wav as the voice reference.
