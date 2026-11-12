Real-meeting test cases cut from the AMI Meeting Corpus (CC BY 4.0).
https://groups.inf.ed.ac.uk/ami/corpus/

23 cases from 6 meetings, one per speaker (A-D = headsets 0-3):
  ES2002a  1 woman, 3 men     scenario meeting
  IS1009a  4 women            scenario meeting (similar voices: hardest pairing)
  ES2004a  2 women, 2 men     scenario meeting
  IS1006a  1 woman, 3 men     scenario meeting
  TS3003a  4 men              scenario meeting (speaker C had no usable overlap window)
  EN2002a  2 women, 2 men     free discussion, 80-100% overlapping speech

Per case (<meeting>_<speaker>):
  _mixture.wav              10 s from the far-field room microphone (Array1-01), target overlaps others
  _reference.wav            5 s of the target alone from their own headset (different part of the meeting)
  _reference_roommic.wav    same 5 s, but from the room microphone (matches the mixture's mic)
  _target_headset.wav       target's headset for the same 10 s (approximate ground truth, has crosstalk)
  _transcript.txt           human transcript: target's words and other speakers' words
  _echofocus_*.wav          EchoFocus outputs (where present)

To try one in the app: upload _mixture.wav as the mixture and _reference_roommic.wav as the voice reference.
