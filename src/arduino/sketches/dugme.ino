// Düğmeyle LED: D2'deki düğmeye basılınca D13'teki LED yanar.
// INPUT_PULLUP: pin içerideki ≈ 35 kΩ'luk dirençle 5 V'a çekilir. Düğme pini GND'ye bağlar;
// yani düğme basılıyken pin LOW, bırakılınca HIGH okunur.
const int BUTTON_PIN = 2;
const int LED_PIN = 13;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  bool pressed = digitalRead(BUTTON_PIN) == LOW;
  digitalWrite(LED_PIN, pressed ? HIGH : LOW);
}
