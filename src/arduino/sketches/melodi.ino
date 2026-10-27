// Melodi: tone() D8'den istenen frekansta kare dalga verir; hoparlör (seri 150 Ω ile) çalar.
// Ezgi: "Twinkle Twinkle Little Star" (Fransız halk ezgisi, telifsiz).
const int SPEAKER = 8;
const int NOTE_C4 = 262, NOTE_D4 = 294, NOTE_E4 = 330, NOTE_F4 = 349, NOTE_G4 = 392, NOTE_A4 = 440;
const int melody[] = { NOTE_C4, NOTE_C4, NOTE_G4, NOTE_G4, NOTE_A4, NOTE_A4, NOTE_G4,
                       NOTE_F4, NOTE_F4, NOTE_E4, NOTE_E4, NOTE_D4, NOTE_D4, NOTE_C4 };
const int beats[] = { 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 2 };
const int BEAT_MS = 300;

void setup() {
}

void loop() {
  for (int i = 0; i < 14; i++) {
    int duration = beats[i] * BEAT_MS;
    tone(SPEAKER, melody[i], duration * 9 / 10);
    delay(duration);
  }
  delay(1000);
}
