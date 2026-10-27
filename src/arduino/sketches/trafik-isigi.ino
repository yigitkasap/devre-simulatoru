// Trafik ışığı: kırmızı (D12), sarı (D11) ve yeşil (D10) LED'ler sırayla yanar.
const int RED = 12;
const int YELLOW = 11;
const int GREEN = 10;

void lights(bool red, bool yellow, bool green) {
  digitalWrite(RED, red ? HIGH : LOW);
  digitalWrite(YELLOW, yellow ? HIGH : LOW);
  digitalWrite(GREEN, green ? HIGH : LOW);
}

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(YELLOW, OUTPUT);
  pinMode(GREEN, OUTPUT);
}

void loop() {
  lights(true, false, false);   // dur
  delay(3000);
  lights(true, true, false);    // hazırlan
  delay(1000);
  lights(false, false, true);   // geç
  delay(3000);
  lights(false, true, false);   // dikkat
  delay(1000);
}
